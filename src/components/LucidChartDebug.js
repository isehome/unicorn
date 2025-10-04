import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { 
  fetchDocumentContents, 
  extractDocumentIdFromUrl, 
  exportDocumentPage 
} from '../services/lucidApi';
import { 
  getCachedPageImage,
  hasCachedDocument,
  preloadDocumentPages
} from '../services/lucidCacheService';
import { AlertCircle, CheckCircle, Loader, X } from 'lucide-react';

const LucidChartDebug = () => {
  const [results, setResults] = useState([]);
  const [running, setRunning] = useState(false);
  const [testUrl, setTestUrl] = useState('');
  
  const addResult = (test, status, message, details = null) => {
    setResults(prev => [...prev, { test, status, message, details, timestamp: new Date() }]);
  };

  const clearResults = () => {
    setResults([]);
  };

  const runDiagnostics = async () => {
    if (!testUrl) {
      alert('Please enter a Lucid Chart URL');
      return;
    }

    setRunning(true);
    clearResults();
    
    try {
      // Test 1: Check API Key
      addResult('API Key Check', 'running', 'Checking API key configuration...');
      const apiKey = process.env.REACT_APP_LUCID_API_KEY;
      if (!apiKey) {
        addResult('API Key Check', 'error', 'API key not found', 
          'Please set REACT_APP_LUCID_API_KEY in your .env.local file');
      } else {
        addResult('API Key Check', 'success', 
          `API key configured (${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)})`);
      }

      // Test 2: Extract Document ID
      addResult('Document ID Extraction', 'running', 'Extracting document ID from URL...');
      const documentId = extractDocumentIdFromUrl(testUrl);
      if (!documentId) {
        addResult('Document ID Extraction', 'error', 'Failed to extract document ID', 
          `URL: ${testUrl}`);
        throw new Error('Invalid URL');
      }
      addResult('Document ID Extraction', 'success', `Document ID: ${documentId}`);

      // Test 3: Check Supabase Bucket
      addResult('Supabase Bucket', 'running', 'Checking if lucid-chart-cache bucket exists...');
      try {
        const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
        
        if (bucketError) {
          addResult('Supabase Bucket', 'error', 'Failed to list buckets', bucketError.message);
        } else {
          const cacheBucketExists = buckets?.some(b => b.id === 'lucid-chart-cache' || b.name === 'lucid-chart-cache');
          if (cacheBucketExists) {
            addResult('Supabase Bucket', 'success', 'lucid-chart-cache bucket exists');
          } else {
            addResult('Supabase Bucket', 'warning', 'lucid-chart-cache bucket not found',
              'Run the SQL migration: supabase/lucid_chart_cache.sql');
          }
        }
      } catch (error) {
        addResult('Supabase Bucket', 'error', 'Error checking buckets', error.message);
      }

      // Test 4: Check Supabase Table
      addResult('Supabase Table', 'running', 'Checking if lucid_chart_cache table exists...');
      try {
        const { data, error } = await supabase
          .from('lucid_chart_cache')
          .select('id')
          .limit(1);
        
        if (error) {
          if (error.message.includes('relation') && error.message.includes('does not exist')) {
            addResult('Supabase Table', 'warning', 'lucid_chart_cache table not found',
              'Run the SQL migration: supabase/lucid_chart_cache.sql');
          } else {
            addResult('Supabase Table', 'error', 'Error accessing table', error.message);
          }
        } else {
          addResult('Supabase Table', 'success', 'lucid_chart_cache table exists');
        }
      } catch (error) {
        addResult('Supabase Table', 'error', 'Error checking table', error.message);
      }

      // Test 5: Fetch Document Contents
      addResult('Document Contents', 'running', 'Fetching document contents...');
      try {
        const docData = await fetchDocumentContents(documentId);
        if (docData && docData.pages) {
          addResult('Document Contents', 'success', 
            `Retrieved ${docData.pages.length} pages`,
            docData.pages.map(p => p.title || 'Untitled').join(', '));
        } else {
          addResult('Document Contents', 'error', 'No pages found in document');
        }
      } catch (error) {
        addResult('Document Contents', 'error', 'Failed to fetch document', error.message);
      }

      // Test 6: Export First Page as Image
      addResult('Image Export', 'running', 'Testing image export for first page...');
      try {
        // Use the updated exportDocumentPage that returns base64
        const base64Image = await exportDocumentPage(documentId, 0);
        
        if (base64Image) {
          // Check if it's a valid base64 data URL
          if (base64Image.startsWith('data:image')) {
            addResult('Image Export', 'success', 'Successfully exported image');
            addResult('Image Display', 'success', 'Image loaded successfully', base64Image);
          } else {
            addResult('Image Export', 'error', 'Invalid image format received', base64Image.substring(0, 100));
          }
        } else {
          addResult('Image Export', 'error', 'No image data received');
        }
      } catch (error) {
        addResult('Image Export', 'error', 'Failed to export image', error.message);
      }

      // Test 7: Test Cache Service
      addResult('Cache Service', 'running', 'Testing cache service...');
      try {
        const hasCached = await hasCachedDocument(documentId);
        addResult('Cache Check', 'info', `Document ${hasCached ? 'has' : 'does not have'} cached images`);
        
        // Try to get cached image for first page
        const cachedUrl = await getCachedPageImage(documentId, 0, { title: 'Page 1' });
        if (cachedUrl) {
          if (cachedUrl.startsWith('data:')) {
            addResult('Cache Service', 'success', 'Generated base64 fallback image');
          } else if (cachedUrl.includes('supabase')) {
            addResult('Cache Service', 'success', 'Retrieved Supabase storage URL', cachedUrl);
          } else {
            addResult('Cache Service', 'warning', 'Unknown URL format', cachedUrl);
          }
        } else {
          addResult('Cache Service', 'error', 'Failed to get cached image URL');
        }
      } catch (error) {
        addResult('Cache Service', 'error', 'Cache service error', error.message);
      }

      // Test 8: Check Network/CORS
      addResult('Network Check', 'running', 'Testing network connectivity...');
      try {
        const testUrl = 'https://api.lucid.co/ping';
        const response = await fetch(testUrl, {
          method: 'HEAD',
          mode: 'no-cors'
        });
        addResult('Network Check', 'success', 'Can reach Lucid API endpoints');
      } catch (error) {
        addResult('Network Check', 'warning', 'Network test inconclusive', 
          'This may be normal due to CORS restrictions');
      }

    } catch (error) {
      addResult('Diagnostic Run', 'error', 'Diagnostic process failed', error.message);
    } finally {
      setRunning(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <X className="w-5 h-5 text-red-500" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      case 'running':
        return <Loader className="w-5 h-5 text-blue-500 animate-spin" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'success':
        return 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800';
      case 'error':
        return 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800';
      case 'running':
        return 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800';
      default:
        return 'bg-gray-50 border-gray-200 dark:bg-gray-900/20 dark:border-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
          Lucid Chart Carousel Diagnostics
        </h1>
        
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Test Configuration
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Lucid Chart URL
              </label>
              <input
                type="text"
                value={testUrl}
                onChange={(e) => setTestUrl(e.target.value)}
                placeholder="https://lucid.app/lucidchart/YOUR-DOC-ID/edit"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md 
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              />
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={runDiagnostics}
                disabled={running}
                className={`px-4 py-2 rounded-md text-white font-medium transition-colors
                  ${running 
                    ? 'bg-gray-400 cursor-not-allowed' 
                    : 'bg-violet-600 hover:bg-violet-700'}`}
              >
                {running ? (
                  <span className="flex items-center gap-2">
                    <Loader className="w-4 h-4 animate-spin" />
                    Running Diagnostics...
                  </span>
                ) : (
                  'Run Diagnostics'
                )}
              </button>
              
              {results.length > 0 && (
                <button
                  onClick={clearResults}
                  className="px-4 py-2 rounded-md bg-gray-200 dark:bg-gray-700 
                           text-gray-700 dark:text-gray-300 font-medium
                           hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Clear Results
                </button>
              )}
            </div>
          </div>
        </div>

        {results.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Diagnostic Results
            </h2>
            
            <div className="space-y-3">
              {results.map((result, index) => (
                <div
                  key={index}
                  className={`p-4 border rounded-lg ${getStatusColor(result.status)}`}
                >
                  <div className="flex items-start gap-3">
                    {getStatusIcon(result.status)}
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900 dark:text-white">
                        {result.test}
                      </h3>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                        {result.message}
                      </p>
                      {result.details && (
                        <div className="mt-2">
                          {result.details.startsWith('data:image') ? (
                            <img 
                              src={result.details} 
                              alt="Test result" 
                              className="max-w-xs rounded border border-gray-300 dark:border-gray-600"
                            />
                          ) : (
                            <pre className="text-xs bg-gray-100 dark:bg-gray-900 p-2 rounded overflow-x-auto">
                              {result.details}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
            Troubleshooting Guide
          </h3>
          <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
            <li>Ensure REACT_APP_LUCID_API_KEY is set in your .env.local file</li>
            <li>Run the SQL migration: <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">supabase/lucid_chart_cache.sql</code></li>
            <li>Check that the Lucid document is accessible with your API key</li>
            <li>Verify that your Supabase project is properly configured</li>
            <li>Check browser console for additional error messages</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default LucidChartDebug;
