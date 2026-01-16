/**
 * Submittals Report Service
 *
 * Generates submittal documentation packages for projects.
 * Queries all unique parts used in a project and collects their submittal documents.
 * Deduplicates by global_part_id (one document per part type, not per instance).
 */

import { supabase } from '../lib/supabase';

class SubmittalsReportService {
  /**
   * Get all unique global parts with submittal documents used in a project.
   * Deduplicates - only returns one entry per part type regardless of quantity used.
   *
   * @param {string} projectId - The project UUID
   * @returns {Promise<Array>} Array of parts with submittal info
   */
  async getProjectSubmittalParts(projectId) {
    if (!projectId) {
      throw new Error('Project ID is required');
    }

    // Query project_equipment to get unique global_part_ids used in this project
    // Then join to get the submittal URLs from global_parts
    let data, error;

    // Try with submittal fields first
    const result = await supabase
      .from('project_equipment')
      .select(`
        global_part_id,
        global_parts:global_part_id (
          id,
          part_number,
          name,
          manufacturer,
          model,
          submittal_pdf_url,
          submittal_sharepoint_url,
          submittal_sharepoint_drive_id,
          submittal_sharepoint_item_id
        )
      `)
      .eq('project_id', projectId)
      .not('global_part_id', 'is', null);

    data = result.data;
    error = result.error;

    // If we get an error about columns not existing, try without submittal fields
    if (error && (error.message?.includes('column') || error.code === 'PGRST204')) {
      console.warn('[SubmittalsReportService] Submittal columns may not exist, trying basic query');
      const fallbackResult = await supabase
        .from('project_equipment')
        .select(`
          global_part_id,
          global_parts:global_part_id (
            id,
            part_number,
            name,
            manufacturer,
            model
          )
        `)
        .eq('project_id', projectId)
        .not('global_part_id', 'is', null);

      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error) {
      console.error('[SubmittalsReportService] Error fetching equipment:', error);
      console.error('[SubmittalsReportService] Error details:', JSON.stringify(error, null, 2));
      throw new Error(error.message || 'Failed to fetch project equipment');
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Deduplicate by global_part_id and filter to only parts with submittals
    const uniqueParts = new Map();
    for (const item of data) {
      const part = item.global_parts;
      if (!part) continue;

      // Skip if we already have this part
      if (uniqueParts.has(part.id)) continue;

      // Skip if part has no submittal documents
      if (!part.submittal_pdf_url && !part.submittal_sharepoint_url) continue;

      uniqueParts.set(part.id, {
        id: part.id,
        partNumber: part.part_number,
        name: part.name,
        manufacturer: part.manufacturer || 'Unknown',
        model: part.model,
        submittalPdfUrl: part.submittal_pdf_url,
        submittalSharepointUrl: part.submittal_sharepoint_url,
        submittalSharepointDriveId: part.submittal_sharepoint_drive_id,
        submittalSharepointItemId: part.submittal_sharepoint_item_id,
        hasExternalUrl: !!part.submittal_pdf_url,
        hasUploadedFile: !!part.submittal_sharepoint_url
      });
    }

    // Convert to array and sort by manufacturer, then name
    const partsArray = Array.from(uniqueParts.values());
    partsArray.sort((a, b) => {
      const mfgCompare = (a.manufacturer || '').localeCompare(b.manufacturer || '');
      if (mfgCompare !== 0) return mfgCompare;
      return (a.name || '').localeCompare(b.name || '');
    });

    return partsArray;
  }

  /**
   * Get count of equipment items per global part in a project.
   * Useful for showing "Used: 5x" in the submittals list.
   *
   * @param {string} projectId - The project UUID
   * @returns {Promise<Map>} Map of global_part_id -> count
   */
  async getPartUsageCounts(projectId) {
    if (!projectId) return new Map();

    const { data, error } = await supabase
      .from('project_equipment')
      .select('global_part_id')
      .eq('project_id', projectId)
      .not('global_part_id', 'is', null);

    if (error) {
      console.error('[SubmittalsReportService] Error fetching counts:', error);
      return new Map();
    }

    // Count occurrences
    const counts = new Map();
    for (const item of data || []) {
      const partId = item.global_part_id;
      counts.set(partId, (counts.get(partId) || 0) + 1);
    }

    return counts;
  }

  /**
   * Generate a manifest of files to include in the submittals package.
   * Returns structured data for the ZIP generator.
   *
   * @param {string} projectId - The project UUID
   * @returns {Promise<Object>} Manifest with parts and wiremap info
   */
  async generateSubmittalsManifest(projectId) {
    if (!projectId) {
      throw new Error('Project ID is required for manifest generation');
    }

    // Get project info for naming
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('name, lucid_url')
      .eq('id', projectId)
      .single();

    if (projectError) {
      console.error('[SubmittalsReportService] Error fetching project:', projectError);
      console.error('[SubmittalsReportService] Error details:', JSON.stringify(projectError, null, 2));
      console.error('[SubmittalsReportService] ProjectId used:', projectId);
      throw new Error(`Failed to fetch project details: ${projectError.message || projectError.code || 'Unknown error'}`);
    }

    // Get parts with submittals
    const parts = await this.getProjectSubmittalParts(projectId);
    const usageCounts = await this.getPartUsageCounts(projectId);

    // Add usage count to each part
    const partsWithCounts = parts.map(part => ({
      ...part,
      usageCount: usageCounts.get(part.id) || 0
    }));

    // Extract Lucid document ID from URL if present
    let lucidDocumentId = null;
    if (project?.lucid_url) {
      // Lucid URLs typically look like: https://lucid.app/documents/view/DOCUMENT_ID/...
      const match = project.lucid_url.match(/\/documents\/(?:view|edit)\/([a-f0-9-]+)/i);
      if (match) {
        lucidDocumentId = match[1];
      }
    }

    return {
      projectId,
      projectName: project?.name || 'Unknown Project',
      lucidUrl: project?.lucid_url,
      lucidDocumentId,
      parts: partsWithCounts,
      totalParts: partsWithCounts.length,
      hasWiremap: !!lucidDocumentId,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Get summary statistics for the submittals tab display.
   *
   * @param {string} projectId - The project UUID
   * @returns {Promise<Object>} Summary statistics
   */
  async getSubmittalsSummary(projectId) {
    const parts = await this.getProjectSubmittalParts(projectId);
    const usageCounts = await this.getPartUsageCounts(projectId);

    // Count by manufacturer
    const byManufacturer = {};
    for (const part of parts) {
      const mfg = part.manufacturer || 'Unknown';
      if (!byManufacturer[mfg]) {
        byManufacturer[mfg] = { count: 0, parts: [] };
      }
      byManufacturer[mfg].count++;
      byManufacturer[mfg].parts.push(part.name || part.partNumber);
    }

    // Get total equipment count for context
    const { count: totalEquipment } = await supabase
      .from('project_equipment')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);

    // Get unique parts count (with or without submittals)
    const { data: allParts } = await supabase
      .from('project_equipment')
      .select('global_part_id')
      .eq('project_id', projectId)
      .not('global_part_id', 'is', null);

    const uniquePartIds = new Set((allParts || []).map(p => p.global_part_id));

    return {
      partsWithSubmittals: parts.length,
      totalUniquePartTypes: uniquePartIds.size,
      totalEquipmentInstances: totalEquipment || 0,
      coveragePercent: uniquePartIds.size > 0
        ? Math.round((parts.length / uniquePartIds.size) * 100)
        : 0,
      byManufacturer,
      usageCounts: Object.fromEntries(usageCounts)
    };
  }
}

export const submittalsReportService = new SubmittalsReportService();
export default submittalsReportService;
