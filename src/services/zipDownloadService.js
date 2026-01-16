/**
 * ZIP Download Service
 *
 * Generates and downloads ZIP files containing submittal documents
 * and Lucid wiremap PNG for project documentation packages.
 */

import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { exportDocumentPage } from './lucidApi';

/**
 * Sanitize a filename by removing invalid characters
 * @param {string} name - The filename to sanitize
 * @returns {string} Sanitized filename
 */
const sanitizeFilename = (name) => {
  if (!name) return 'unknown';
  return name
    .replace(/[/\\?%*:|"<>]/g, '-') // Replace invalid chars with dash
    .replace(/\s+/g, '_')           // Replace spaces with underscore
    .replace(/-+/g, '-')            // Collapse multiple dashes
    .replace(/_+/g, '_')            // Collapse multiple underscores
    .trim();
};

/**
 * Convert a data URL to a Blob
 * @param {string} dataUrl - The data URL (e.g., from canvas or image export)
 * @returns {Blob} The blob
 */
const dataURLtoBlob = (dataUrl) => {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
};

/**
 * Fetch a file from a URL and return as a Blob
 * For external URLs, we may need to proxy through our API
 * @param {string} url - The URL to fetch
 * @param {Object} options - Options including SharePoint metadata
 * @returns {Promise<Blob>} The file blob
 */
const fetchFileAsBlob = async (url, options = {}) => {
  const { isSharePoint, driveId, itemId } = options;

  try {
    // For SharePoint files, use our proxy endpoint
    if (isSharePoint && driveId && itemId) {
      const proxyUrl = `/api/sharepoint-download?driveId=${encodeURIComponent(driveId)}&itemId=${encodeURIComponent(itemId)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        throw new Error(`Failed to download SharePoint file: ${response.status}`);
      }
      return await response.blob();
    }

    // For external URLs, try direct fetch first
    // If CORS blocks us, we'll need a proxy
    try {
      const response = await fetch(url, { mode: 'cors' });
      if (response.ok) {
        return await response.blob();
      }
    } catch {
      // CORS blocked - try through proxy
    }

    // Fallback: Use our general image proxy
    const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status}`);
    }
    return await response.blob();
  } catch (error) {
    console.error('[zipDownloadService] Error fetching file:', error);
    throw error;
  }
};

/**
 * Generate and download a submittals package ZIP file
 *
 * @param {string} projectId - The project UUID
 * @param {string} projectName - The project name for the ZIP filename
 * @param {Object} manifest - The manifest from submittalsReportService
 * @param {Function} onProgress - Optional progress callback (percent, message)
 * @returns {Promise<void>}
 */
export async function downloadSubmittalsPackage(projectId, projectName, manifest, onProgress) {
  const zip = new JSZip();
  const progress = onProgress || (() => {});
  let completed = 0;
  const total = manifest.parts.length + (manifest.hasWiremap ? 1 : 0);

  const updateProgress = (message) => {
    completed++;
    const percent = Math.round((completed / total) * 100);
    progress(percent, message);
  };

  // 1. Create Submittals folder and add PDFs
  const submittalsFolder = zip.folder('Submittals');

  for (const part of manifest.parts) {
    try {
      // Skip parts without valid file references
      const hasSharePointFile = part.submittalSharepointUrl && part.submittalSharepointDriveId && part.submittalSharepointItemId;
      const hasExternalUrl = part.submittalPdfUrl && part.submittalPdfUrl.startsWith('http');

      if (!hasSharePointFile && !hasExternalUrl) {
        console.log(`[zipDownloadService] Skipping ${part.name} - no valid file reference`);
        continue;
      }

      // Prefer SharePoint file if available (has driveId/itemId for reliable download)
      const useSharePoint = hasSharePointFile;
      const url = useSharePoint ? part.submittalSharepointUrl : part.submittalPdfUrl;

      const fetchOptions = {
        isSharePoint: useSharePoint,
        driveId: part.submittalSharepointDriveId,
        itemId: part.submittalSharepointItemId
      };

      // Generate filename: Manufacturer-Model.pdf or Manufacturer-PartNumber.pdf
      const filename = sanitizeFilename(
        `${part.manufacturer}-${part.model || part.partNumber || part.name}`
      ) + '.pdf';

      progress(Math.round((completed / total) * 100), `Downloading ${filename}...`);

      const blob = await fetchFileAsBlob(url, fetchOptions);
      submittalsFolder.file(filename, blob);

      updateProgress(`Added ${filename}`);
    } catch (error) {
      console.error(`[zipDownloadService] Failed to fetch submittal for ${part.name}:`, error);
      // Continue with other files even if one fails
      updateProgress(`Skipped ${part.name} (error)`);
    }
  }

  // 2. Add Lucid wiremap PNG if available
  if (manifest.lucidDocumentId) {
    try {
      progress(Math.round((completed / total) * 100), 'Exporting wiremap...');

      // Export page 0 (first page) as PNG, force proxy to avoid placeholder
      const pngDataUrl = await exportDocumentPage(manifest.lucidDocumentId, 0, null, { forceProxy: true });

      // Check if we got a real image (not a placeholder)
      // Placeholder images contain "Enable CORS" text or are very small
      const isPlaceholder = !pngDataUrl ||
        pngDataUrl.includes('RW5hYmxlIENPUlM=') || // base64 for "Enable CORS"
        pngDataUrl.length < 1000; // Real images are much larger

      if (pngDataUrl && !isPlaceholder) {
        const wireMapBlob = dataURLtoBlob(pngDataUrl);
        zip.file('Wiremap.png', wireMapBlob);
        updateProgress('Added wiremap');
      } else {
        console.warn('[zipDownloadService] Wiremap export returned placeholder or empty');
        updateProgress('Skipped wiremap (export unavailable)');
      }
    } catch (error) {
      console.error('[zipDownloadService] Failed to export wiremap:', error);
      updateProgress('Skipped wiremap (error)');
    }
  }

  // 3. Add a manifest.txt file listing contents
  const manifestText = generateManifestText(projectName, manifest);
  zip.file('_Contents.txt', manifestText);

  // 4. Generate and save the ZIP
  progress(95, 'Creating ZIP file...');

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  // Generate filename: ProjectName-Submittals.zip
  const zipFilename = sanitizeFilename(projectName) + '-Submittals.zip';

  progress(100, 'Downloading...');
  saveAs(zipBlob, zipFilename);
}

/**
 * Generate a text manifest listing the ZIP contents
 * @param {string} projectName - The project name
 * @param {Object} manifest - The manifest data
 * @returns {string} The manifest text
 */
function generateManifestText(projectName, manifest) {
  const lines = [
    `Submittals Package`,
    `==================`,
    ``,
    `Project: ${projectName}`,
    `Generated: ${new Date().toLocaleString()}`,
    ``,
    `Contents:`,
    `--------`,
    ``
  ];

  // List submittals by manufacturer
  const byMfg = {};
  for (const part of manifest.parts) {
    const mfg = part.manufacturer || 'Unknown';
    if (!byMfg[mfg]) byMfg[mfg] = [];
    byMfg[mfg].push(part);
  }

  for (const [mfg, parts] of Object.entries(byMfg)) {
    lines.push(`${mfg}:`);
    for (const part of parts) {
      const name = part.model || part.partNumber || part.name;
      lines.push(`  - ${name} (${part.usageCount}x used in project)`);
    }
    lines.push(``);
  }

  if (manifest.hasWiremap) {
    lines.push(`Wiremap:`);
    lines.push(`  - Wiremap.png (Lucid floor plan export)`);
    lines.push(``);
  }

  lines.push(`---`);
  lines.push(`Total submittal documents: ${manifest.parts.length}`);
  lines.push(`Wiremap included: ${manifest.hasWiremap ? 'Yes' : 'No'}`);

  return lines.join('\n');
}

/**
 * Check if a project has any downloadable submittals
 * Quick check before showing download button
 *
 * @param {Object} manifest - The manifest data
 * @returns {boolean} True if there's anything to download
 */
export function hasDownloadableContent(manifest) {
  return (manifest?.parts?.length > 0) || manifest?.hasWiremap;
}

export default {
  downloadSubmittalsPackage,
  hasDownloadableContent
};
