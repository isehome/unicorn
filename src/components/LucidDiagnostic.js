import React, { useState } from 'react';
import { 
  Download, 
  FileText, 
  AlertCircle, 
  CheckCircle, 
  Loader,
  Image as ImageIcon,
  Eye
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import {
  fetchDocumentMetadata,
  fetchDocumentContents,
  extractDocumentIdFromUrl,
  exportDocumentPage
} from '../services/lucidApi';
import LucidIframeEmbed from './LucidIframeEmbed';

const LucidDiagnostic = () => {
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];
  
  const [documentUrl, setDocumentUrl] = useState('');
  const [documentId, setDocumentId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [metadata, setMetadata] = useState(null);
  const [contents, setContents] = useState(null);
  const [error, setError] = useState(null);
  const [testResults, setTestResults] = useState([]);
  const [downloadingPages, setDownloadingPages] = useState({});
  const [showEmbed, setShowEmbed] = useState(false);

  const addTestResult = (test, success, message, data = null) => {
    setTestResults(prev => [...prev, {
      test,
      success,
      message,
      data,
      timestamp: new Date().toISOString()
    }]);
  };

  const handleExtractDocumentId = () => {
    setError(null);
    setTestResults([]);
    setMetadata(null);
    setContents(null);
    setDocumentId(null);

    if (!documentUrl.trim()) {
      setError('Please enter a Lucid Chart URL');
      return;
    }

    const extractedId = extractDocumentIdFromUrl(documentUrl);
    
    if (!extractedId) {
      addTestResult('Extract Document ID', false, 'Failed to extract document ID from URL');
      setError('Invalid Lucid Chart URL format');
      return;
    }

    setDocumentId(extractedId);
    addTestResult('Extract Document ID', true, `Successfully extracted: ${extractedId}`, { documentId: extractedId });
  };

  const handleFetchMetadata = async () => {
    if (!documentId) {
      setError('Extract document ID first');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const meta = await fetchDocumentMetadata(documentId);
      setMetadata(meta);
      addTestResult('Fetch Metadata', true, `Retrieved metadata for "${meta.title || 'Untitled'}"`, meta);
    } catch (err) {
      addTestResult('Fetch Metadata', false, err.message);
      setError(`Metadata fetch failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFetchContents = async () => {
    if (!documentId) {
      setError('Extract document ID first');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await fetchDocumentContents(documentId);
      setContents(data);
      addTestResult(
        'Fetch Contents', 
        true, 
        `Retrieved ${data.pages?.length || 0} pages with shapes and data`,
        { pageCount: data.pages?.length, pages: data.pages?.map(p => ({ id: p.id, title: p.title })) }
      );
    } catch (err) {
      addTestResult('Fetch Contents', false, err.message);
      setError(`Contents fetch failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPage = async (pageIndex, pageId, pageTitle) => {
    if (!documentId) {
      setError('Extract document ID first');
      return;
    }

    setDownloadingPages(prev => ({ ...prev, [pageIndex]: true }));

    try {
      // Request the image export with force proxy option
      const imageDataUrl = await exportDocumentPage(documentId, pageIndex, pageId, {
        scale: 2,
        format: 'png',
        forceProxy: true // Force using the proxy to bypass CORS
      });

      if (!imageDataUrl) {
        throw new Error('No image data received');
      }

      // Check if it's a placeholder or actual image
      const isPlaceholder = imageDataUrl.includes('Thumbnail unavailable') || 
                           imageDataUrl.includes('Enable CORS');

      // Always show the data URL details for debugging
      console.log('Image data URL details:', {
        length: imageDataUrl.length,
        prefix: imageDataUrl.substring(0, 100),
        isPlaceholder
      });

      if (isPlaceholder) {
        addTestResult(
          `Download Page ${pageIndex + 1}`,
          false,
          'Received placeholder image - API may not be returning actual PNG. Check console for details.',
          { 
            pageIndex, 
            pageId, 
            pageTitle, 
            isPlaceholder: true,
            dataUrlPrefix: imageDataUrl.substring(0, 200)
          }
        );
      } else {
        // Create a download link
        const link = document.createElement('a');
        link.href = imageDataUrl;
        link.download = `${pageTitle || `page-${pageIndex + 1}`}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        addTestResult(
          `Download Page ${pageIndex + 1}`,
          true,
          `Successfully downloaded "${pageTitle || `Page ${pageIndex + 1}`}"`,
          { pageIndex, pageId, pageTitle, dataUrlLength: imageDataUrl.length }
        );
      }
    } catch (err) {
      addTestResult(
        `Download Page ${pageIndex + 1}`,
        false,
        err.message,
        { pageIndex, pageId, pageTitle }
      );
      setError(`Download failed: ${err.message}`);
    } finally {
      setDownloadingPages(prev => ({ ...prev, [pageIndex]: false }));
    }
  };

  const handleRunFullTest = async () => {
    setTestResults([]);
    setError(null);
    setMetadata(null);
    setContents(null);

    // Step 1: Extract ID
    handleExtractDocumentId();
    
    if (!documentId && documentUrl) {
      const extractedId = extractDocumentIdFromUrl(documentUrl);
      if (extractedId) {
        setDocumentId(extractedId);
        addTestResult('Extract Document ID', true, `Successfully extracted: ${extractedId}`, { documentId: extractedId });
        
        // Step 2: Fetch metadata
        setLoading(true);
        try {
          const meta = await fetchDocumentMetadata(extractedId);
          setMetadata(meta);
          addTestResult('Fetch Metadata', true, `Retrieved metadata for "${meta.title || 'Untitled'}"`, meta);
          
          // Step 3: Fetch contents
          const data = await fetchDocumentContents(extractedId);
          setContents(data);
          addTestResult(
            'Fetch Contents',
            true,
            `Retrieved ${data.pages?.length || 0} pages`,
            { pageCount: data.pages?.length }
          );
        } catch (err) {
          addTestResult('Full Test', false, err.message);
          setError(err.message);
        } finally {
          setLoading(false);
        }
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors pb-20">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div style={sectionStyles.card} className="mb-6 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/20">
              <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Lucid Charts API Diagnostic
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Test API connectivity and image export functionality
              </p>
            </div>
          </div>

          {/* URL Input */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Lucid Chart Document URL
              </label>
              <input
                type="text"
                value={documentUrl}
                onChange={(e) => setDocumentUrl(e.target.value)}
                placeholder="https://lucid.app/lucidchart/YOUR-DOC-ID/edit"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {documentId && (
              <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm font-medium text-green-800 dark:text-green-300">
                  Document ID: <code className="font-mono">{documentId}</code>
                </p>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleExtractDocumentId}
                disabled={loading || !documentUrl.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <FileText className="w-4 h-4" />
                Extract ID
              </button>

              <button
                onClick={handleFetchMetadata}
                disabled={loading || !documentId}
                className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? <Loader className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                Fetch Metadata
              </button>

              <button
                onClick={handleFetchContents}
                disabled={loading || !documentId}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? <Loader className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                Fetch Contents
              </button>

              <button
                onClick={handleRunFullTest}
                disabled={loading || !documentUrl.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? <Loader className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Run Full Test
              </button>

              <button
                onClick={async () => {
                  if (!documentId) {
                    setError('Extract document ID first');
                    return;
                  }
                  setLoading(true);
                  try {
                    const response = await fetch(`${process.env.REACT_APP_LUCID_PROXY_URL || ''}/api/lucid-proxy`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({
                        documentId,
                        action: 'embedToken',
                        embedOptions: {
                          type: 'document',
                          permissions: ['view'],
                          expiresInSeconds: 3600
                        }
                      })
                    });
                    const data = await response.json();
                    addTestResult('Get Embed Token', response.ok, 
                      response.ok ? 'Successfully got embed token' : 'Failed to get embed token',
                      data
                    );
                    if (response.ok && (data.token || data.embedToken)) {
                      const token = data.token || data.embedToken;
                      // Create iframe URL with token
                      const embedUrl = `https://lucid.app/documents/embeddedchart/${documentId}?token=${token}`;
                      addTestResult('Embed URL', true, 'Generated embed URL', { embedUrl });
                    }
                  } catch (err) {
                    addTestResult('Get Embed Token', false, err.message);
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading || !documentId}
                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? <Loader className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                Test Embed Token
              </button>
            </div>
          </div>
        </div>

        {/* Test Results */}
        {testResults.length > 0 && (
          <div style={sectionStyles.card} className="mb-6 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Test Results
            </h2>
            <div className="space-y-3">
              {testResults.map((result, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg border ${
                    result.success
                      ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                      : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {result.success ? (
                      <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <p className={`font-medium ${
                        result.success
                          ? 'text-green-800 dark:text-green-300'
                          : 'text-red-800 dark:text-red-300'
                      }`}>
                        {result.test}
                      </p>
                      <p className={`text-sm mt-1 ${
                        result.success
                          ? 'text-green-700 dark:text-green-400'
                          : 'text-red-700 dark:text-red-400'
                      }`}>
                        {result.message}
                      </p>
                      {result.data && (
                        <details className="mt-2">
                          <summary className="text-xs cursor-pointer text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200">
                            View details
                          </summary>
                          <pre className="mt-2 p-2 bg-gray-900 dark:bg-black text-green-400 text-xs rounded overflow-x-auto">
                            {JSON.stringify(result.data, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Metadata Display */}
        {metadata && (
          <div style={sectionStyles.card} className="mb-6 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Document Metadata
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Title</p>
                <p className="text-gray-900 dark:text-white">{metadata.title || 'Untitled'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Document ID</p>
                <p className="text-gray-900 dark:text-white font-mono text-sm">{metadata.id || documentId}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Pages</p>
                <p className="text-gray-900 dark:text-white">{metadata.pages?.length || 0}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Version</p>
                <p className="text-gray-900 dark:text-white">{metadata.version || metadata.revision || 'N/A'}</p>
              </div>
            </div>
            {metadata.pages && metadata.pages.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Pages</p>
                <div className="space-y-2">
                  {metadata.pages.map((page, index) => (
                    <div key={page.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {page.title || `Page ${index + 1}`}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                          ID: {page.id}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Contents Display with Download Buttons */}
        {contents && contents.pages && (
          <div style={sectionStyles.card} className="mb-6 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <ImageIcon className="w-5 h-5" />
              Document Pages - Test Image Export
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Click download to test if the API returns actual PNG images
            </p>
            <div className="space-y-3">
              {contents.pages.map((page, index) => (
                <div
                  key={page.id}
                  className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
                >
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 dark:text-white">
                      {page.title || `Page ${index + 1}`}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1">
                      ID: {page.id}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Shapes: {page.shapes?.length || page.items?.shapes?.length || 0}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDownloadPage(index, page.id, page.title)}
                    disabled={downloadingPages[index]}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {downloadingPages[index] ? (
                      <Loader className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    Download PNG
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* API Configuration Info */}
        <div style={sectionStyles.card} className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            API Configuration
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5" />
              <div>
                <p className="text-gray-900 dark:text-white font-medium">Proxy Endpoint</p>
                <p className="text-gray-600 dark:text-gray-400">{process.env.REACT_APP_LUCID_PROXY_URL || 'Using default'}/api/lucid-proxy</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              {process.env.REACT_APP_LUCID_API_KEY ? (
                <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5" />
              )}
              <div>
                <p className="text-gray-900 dark:text-white font-medium">API Key</p>
                <p className="text-gray-600 dark:text-gray-400">
                  {process.env.REACT_APP_LUCID_API_KEY ? 'Configured' : 'Not configured (will use proxy)'}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              <strong>Note:</strong> Image export and embed tokens require special API permissions that are not available in all Lucid plans.
            </p>
          </div>
          
          <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <p className="text-sm text-green-800 dark:text-green-300 font-medium mb-2">
              ✅ Working Alternative: Iframe Embed
            </p>
            <p className="text-sm text-green-700 dark:text-green-400">
              You can display Lucid charts without any API permissions using the iframe embed method. This works with any Lucid account.
            </p>
            {documentId && (
              <button
                onClick={() => setShowEmbed(!showEmbed)}
                className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
              >
                <Eye className="w-4 h-4" />
                {showEmbed ? 'Hide' : 'Show'} Embed Demo
              </button>
            )}
          </div>
        </div>
        
        {/* Iframe Embed Demo */}
        {showEmbed && documentId && (
          <div className="mt-6">
            <LucidIframeEmbed 
              documentId={documentId}
              title="Lucid Chart Embed Demo (No API Required)"
              height="600px"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default LucidDiagnostic;
