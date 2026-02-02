import React, { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import { Loader, AlertCircle, Info } from 'lucide-react';

/**
 * LucidIframeEmbed - Displays Lucid Charts using various embed methods
 * 
 * Three embedding options:
 * 1. Cookie-based: Uses viewer's Lucid session (they must have access)
 * 2. Token-based: Uses embed session token (no public share required!)
 * 3. Public link: Document shared publicly (optional)
 */
const LucidIframeEmbed = ({ 
  documentId, 
  title = 'Lucid Chart', 
  height = '600px',
  embedToken = null,
  embedMethod = 'cookie' // 'cookie', 'token', or 'public'
}) => {
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];
  const [tokenError, setTokenError] = useState(null);
  const [generatedToken, setGeneratedToken] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // Extract just the document ID if a full URL is provided
  const extractDocId = (input) => {
    if (!input) return null;
    // If it's already just an ID, return it
    if (!input.includes('/')) return input;
    // Extract from URL pattern: /lucidchart/DOC-ID-HERE/
    const match = input.match(/lucidchart\/([a-zA-Z0-9-_]+)\//);
    return match ? match[1] : input;
  };
  
  const docId = extractDocId(documentId);
  
  // Generate embed token if using token method and no token provided
  useEffect(() => {
    if (embedMethod === 'token' && !embedToken && !generatedToken && docId) {
      const generateToken = async () => {
        setLoading(true);
        setTokenError(null);
        try {
          const response = await fetch(`${process.env.REACT_APP_LUCID_PROXY_URL || ''}/api/lucid-proxy`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              documentId: docId,
              action: 'embedToken',
              embedOptions: {
                type: 'document',
                permissions: ['view'],
                expiresInSeconds: 600 // 10 minutes
              }
            })
          });
          
          const data = await response.json();
          
          if (response.ok && (data.token || data.embedToken)) {
            setGeneratedToken(data.token || data.embedToken);
          } else {
            throw new Error(data.error || 'Failed to generate embed token');
          }
        } catch (err) {
          console.error('Failed to generate embed token:', err);
          setTokenError(err.message);
        } finally {
          setLoading(false);
        }
      };
      
      generateToken();
    }
  }, [embedMethod, embedToken, generatedToken, docId]);
  
  if (!docId) {
    return (
      <div style={sectionStyles.card} className="p-6 text-center">
        <p className="text-gray-500 dark:text-gray-400">No document ID provided</p>
      </div>
    );
  }
  
  // Determine embed URL based on method
  let embedUrl;
  const activeToken = embedToken || generatedToken;
  
  if (embedMethod === 'token' && activeToken) {
    embedUrl = `https://lucid.app/documents/embeddedchart/${docId}?token=${activeToken}`;
  } else if (embedMethod === 'public') {
    embedUrl = `https://lucid.app/lucidchart/${docId}/view`;
  } else {
    // Cookie-based (default)
    embedUrl = `https://lucid.app/documents/embeddedchart/${docId}`;
  }
  
  return (
    <div style={sectionStyles.card} className="p-4">
      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
        {title}
      </h3>
      
      {/* Embed Method Info */}
      <div
        className="mb-4 p-3 rounded-lg border"
        style={embedMethod === 'token'
          ? { backgroundColor: 'rgba(148, 175, 50, 0.1)', borderColor: 'rgba(148, 175, 50, 0.3)' }
          : embedMethod === 'public'
          ? { backgroundColor: 'rgba(245, 158, 11, 0.1)', borderColor: 'rgba(245, 158, 11, 0.3)' }
          : { backgroundColor: 'rgba(59, 130, 246, 0.1)', borderColor: 'rgba(59, 130, 246, 0.3)' }
        }
      >
        <div className="flex items-start gap-2">
          <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            {embedMethod === 'token' ? (
              <>
                <p className="font-medium" style={{ color: '#94AF32' }}>
                  Token-based Embed (No Public Share Required!)
                </p>
                <p className="mt-1" style={{ color: '#94AF32' }}>
                  Using temporary access token. Viewers don't need Lucid accounts.
                  {activeToken && ' Token expires in 10 minutes.'}
                </p>
              </>
            ) : embedMethod === 'public' ? (
              <>
                <p className="font-medium text-yellow-800 dark:text-yellow-300">
                  Public Embed
                </p>
                <p className="text-yellow-700 dark:text-yellow-400 mt-1">
                  Document must be shared publicly in Lucid (Share → "Anyone with the link can view")
                </p>
              </>
            ) : (
              <>
                <p className="font-medium text-blue-800 dark:text-blue-300">
                  Cookie-based Embed
                </p>
                <p className="text-blue-700 dark:text-blue-400 mt-1">
                  Works for users signed into Lucid with document access. No public share needed.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
      
      {/* Error message */}
      {tokenError && embedMethod === 'token' && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-red-800 dark:text-red-300">
                Failed to generate embed token
              </p>
              <p className="text-red-700 dark:text-red-400 mt-1">
                {tokenError}. Falling back to cookie-based embed.
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Loading state */}
      {loading && embedMethod === 'token' && (
        <div className="mb-4 flex items-center justify-center p-4">
          <Loader className="w-6 h-6 animate-spin text-blue-500 mr-2" />
          <span className="text-gray-600 dark:text-gray-400">Generating embed token...</span>
        </div>
      )}
      
      <div 
        className="w-full rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700"
        style={{ height }}
      >
        <iframe
          src={embedUrl}
          width="100%"
          height="100%"
          frameBorder="0"
          allowFullScreen
          allow="fullscreen"
          title={title}
          className="bg-white"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
        />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Document ID: {docId}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Method: {embedMethod}
          {embedMethod === 'token' && activeToken && ' (token active)'}
        </p>
      </div>
    </div>
  );
};

export default LucidIframeEmbed;

/**
 * Usage Examples:
 * 
 * import LucidIframeEmbed from './components/LucidIframeEmbed';
 * 
 * // Cookie-based (default) - User must be signed into Lucid:
 * <LucidIframeEmbed 
 *   documentId="f0e89b19-d72d-4ab1-8cb9-2712dbca4bc1"
 *   title="Floor Plan"
 *   embedMethod="cookie"
 * />
 * 
 * // Token-based - No public share or Lucid login required:
 * <LucidIframeEmbed 
 *   documentId="f0e89b19-d72d-4ab1-8cb9-2712dbca4bc1"
 *   title="Floor Plan"
 *   embedMethod="token"
 *   // Token will be auto-generated, or provide your own:
 *   // embedToken="your-token-here"
 * />
 * 
 * // Public link - Document must be publicly shared:
 * <LucidIframeEmbed 
 *   documentId="f0e89b19-d72d-4ab1-8cb9-2712dbca4bc1"
 *   title="Project Diagram"
 *   embedMethod="public"
 * />
 */
