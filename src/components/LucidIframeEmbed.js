import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';

/**
 * LucidIframeEmbed - Displays Lucid Charts without needing API permissions
 * 
 * This component uses the public embed URL which doesn't require any API key
 * or special permissions. It's the simplest way to display Lucid charts.
 */
const LucidIframeEmbed = ({ documentId, title = 'Lucid Chart', height = '600px' }) => {
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];
  
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
  
  if (!docId) {
    return (
      <div style={sectionStyles.card} className="p-6 text-center">
        <p className="text-gray-500 dark:text-gray-400">No document ID provided</p>
      </div>
    );
  }
  
  // Lucid's public embed URL - no API key needed
  const embedUrl = `https://lucid.app/documents/embedded/${docId}`;
  
  return (
    <div style={sectionStyles.card} className="p-4">
      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
        {title}
      </h3>
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
          title={title}
          className="bg-white"
        />
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
        Document ID: {docId}
      </p>
    </div>
  );
};

export default LucidIframeEmbed;

/**
 * Usage Example:
 * 
 * import LucidIframeEmbed from './components/LucidIframeEmbed';
 * 
 * // With just the document ID:
 * <LucidIframeEmbed 
 *   documentId="f0e89b19-d72d-4ab1-8cb9-2712dbca4bc1"
 *   title="Floor Plan"
 *   height="800px"
 * />
 * 
 * // Or with full URL (it will extract the ID):
 * <LucidIframeEmbed 
 *   documentId="https://lucid.app/lucidchart/f0e89b19-d72d-4ab1-8cb9-2712dbca4bc1/edit"
 *   title="Project Diagram"
 * />
 */
