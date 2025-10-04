import React, { useState } from 'react';
import { exportDocumentPage, extractDocumentIdFromUrl, fetchDocumentContents } from '../services/lucidApi';
import { Loader, AlertCircle, CheckCircle } from 'lucide-react';

const LucidChartTest = () => {
  const [testUrl, setTestUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState({});
  const [imageData, setImageData] = useState(null);

  const runTests = async () => {
    if (!testUrl) {
      alert('Please enter a Lucid Chart URL');
      return;
    }

    setLoading(true);
    setResults({});
    setImageData(null);

    const testResults = {};

    try {
      // Test 1: Extract Document ID
      testResults.extractId = { status: 'testing' };
      const documentId = extractDocumentIdFromUrl(testUrl);
      if (documentId) {
        testResults.extractId = { 
          status: 'success', 
          value: documentId,
          message: `Extracted ID: ${documentId}`
        };
      } else {
        testResults.extractId = { 
          status: 'error', 
          message: 'Failed to extract document ID from URL'
        };
        setResults(testResults);
        setLoading(false);
        return;
      }

      // Test 2: Check API Key
      testResults.apiKey = { status: 'testing' };
      const apiKey = process.env.REACT_APP_LUCID_API_KEY;
      if (apiKey) {
        testResults.apiKey = { 
          status: 'success', 
          message: `API Key found (${apiKey.substring(0, 10)}...)`
        };
      } else {
        testResults.apiKey = { 
          status: 'error', 
          message: 'No API key found in environment'
        };
      }

      // Test 3: Fetch Document Contents
      testResults.fetchContents = { status: 'testing' };
      try {
        const docData = await fetchDocumentContents(documentId);
        if (docData && docData.pages) {
          testResults.fetchContents = { 
            status: 'success', 
            message: `Found ${docData.pages.length} pages`,
            pages: docData.pages.map((p, i) => ({ 
              index: i, 
              title: p.title || `Page ${i + 1}`,
              id: p.id 
            }))
          };
        } else {
          testResults.fetchContents = { 
            status: 'error', 
            message: 'No pages found in document'
          };
        }
      } catch (error) {
        testResults.fetchContents = { 
          status: 'error', 
          message: `Failed to fetch contents: ${error.message}`
        };
      }

      // Test 4: Export First Page as Image
      if (testResults.fetchContents.status === 'success' && apiKey) {
        testResults.exportImage = { status: 'testing' };
        try {
          console.log('Attempting to export page 0...');
          const blob = await exportDocumentPage(documentId, 0, apiKey);
          
          if (blob) {
            // Convert blob to base64
            const reader = new FileReader();
            const base64 = await new Promise((resolve, reject) => {
              reader.onloadend = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            
            setImageData(base64);
            testResults.exportImage = { 
              status: 'success', 
              message: `Successfully exported page (${blob.size} bytes)`
            };
          } else {
            testResults.exportImage = { 
              status: 'error', 
              message: 'No blob returned from export'
            };
          }
        } catch (error) {
          testResults.exportImage = { 
            status: 'error', 
            message: `Failed to export image: ${error.message}`
          };
          console.error('Export error:', error);
        }
      }

    } catch (error) {
      console.error('Test error:', error);
      testResults.general = { 
        status: 'error', 
        message: `General error: ${error.message}`
      };
    }

    setResults(testResults);
    setLoading(false);
  };

  const getStatusIcon = (status) => {
    if (status === 'success') return <CheckCircle className="w-5 h-5 text-green-600" />;
    if (status === 'error') return <AlertCircle className="w-5 h-5 text-red-600" />;
    if (status === 'testing') return <Loader className="w-5 h-5 animate-spin text-blue-600" />;
    return null;
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Lucid Chart API Test</h1>
      
      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium mb-2">
            Lucid Chart URL
          </label>
          <input
            type="url"
            value={testUrl}
            onChange={(e) => setTestUrl(e.target.value)}
            placeholder="https://lucid.app/lucidchart/..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>
        
        <button
          onClick={runTests}
          disabled={loading}
          className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50"
        >
          {loading ? 'Running Tests...' : 'Run Tests'}
        </button>
      </div>

      {Object.keys(results).length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Test Results:</h2>
          
          {Object.entries(results).map(([key, result]) => (
            <div key={key} className="border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                {getStatusIcon(result.status)}
                <span className="font-medium capitalize">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </span>
              </div>
              
              <div className="text-sm text-gray-600">
                {result.message && <p>{result.message}</p>}
                {result.value && (
                  <p className="font-mono text-xs mt-1">{result.value}</p>
                )}
                {result.pages && (
                  <div className="mt-2">
                    <p className="font-medium">Pages:</p>
                    <ul className="list-disc list-inside">
                      {result.pages.map((page) => (
                        <li key={page.id}>
                          {page.title} (Index: {page.index})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {imageData && (
        <div className="mt-6 border rounded-lg p-4">
          <h3 className="font-medium mb-2">Exported Image (First Page):</h3>
          <img 
            src={imageData} 
            alt="Lucid Chart Page" 
            className="max-w-full rounded border"
          />
        </div>
      )}

      <div className="mt-8 p-4 bg-gray-100 rounded-lg">
        <h3 className="font-medium mb-2">Environment Info:</h3>
        <ul className="text-sm space-y-1">
          <li>NODE_ENV: {process.env.NODE_ENV}</li>
          <li>API Key Present: {process.env.REACT_APP_LUCID_API_KEY ? 'Yes' : 'No'}</li>
          <li>API Key Prefix: {process.env.REACT_APP_LUCID_API_KEY?.substring(0, 15)}...</li>
        </ul>
      </div>

      <div className="mt-4 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-medium mb-2">Console Output:</h3>
        <p className="text-sm text-gray-600">
          Check your browser console for detailed API responses and errors.
        </p>
      </div>
    </div>
  );
};

export default LucidChartTest;
