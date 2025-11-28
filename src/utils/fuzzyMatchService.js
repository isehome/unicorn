/**
 * Fuzzy Vendor Matching Service
 *
 * Matches supplier names from CSV imports to existing suppliers in the database
 * using fuzzy string matching logic. Auto-creates vendors if no match found.
 *
 * Uses fuse.js for fuzzy searching with customizable thresholds.
 */

import Fuse from 'fuse.js';
import { supabase } from '../lib/supabase';

class FuzzyMatchService {
  constructor() {
    // Fuse.js configuration for fuzzy matching
    this.fuseOptions = {
      includeScore: true,
      threshold: 0.3, // 0.0 = exact match, 1.0 = match anything
      distance: 100,
      minMatchCharLength: 2,
      keys: [
        { name: 'name', weight: 0.7 },
        { name: 'short_code', weight: 0.2 },
        { name: 'alternate_names', weight: 0.1 }
      ]
    };

    this.cache = {
      suppliers: null,
      lastFetch: null,
      ttl: 5 * 60 * 1000 // 5 minutes cache
    };
  }

  /**
   * Get all suppliers from database with caching
   */
  async getAllSuppliers(forceRefresh = false) {
    const now = Date.now();

    // Return cached data if still valid
    if (!forceRefresh && this.cache.suppliers &&
      this.cache.lastFetch &&
      (now - this.cache.lastFetch) < this.cache.ttl) {
      return this.cache.suppliers;
    }

    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      // Update cache
      this.cache.suppliers = data || [];
      this.cache.lastFetch = now;

      return this.cache.suppliers;
    } catch (error) {
      console.error('Error fetching suppliers:', error);
      // Return cached data if available, even if expired
      return this.cache.suppliers || [];
    }
  }

  /**
   * Match a supplier name from CSV to existing suppliers
   *
   * @param {string} supplierNameFromCSV - The supplier name from imported CSV
   * @param {number} confidenceThreshold - Minimum confidence score (0-1) to accept match
   * @returns {Object} Match result with supplier data, confidence score, and suggestions
   */
  async matchSupplier(supplierNameFromCSV, confidenceThreshold = 0.7) {
    if (!supplierNameFromCSV || typeof supplierNameFromCSV !== 'string') {
      return {
        matched: false,
        supplier: null,
        confidence: 0,
        suggestions: [],
        action: 'create',
        message: 'Invalid supplier name provided'
      };
    }

    // Normalize input
    const searchTerm = supplierNameFromCSV.trim();

    if (searchTerm.length === 0) {
      return {
        matched: false,
        supplier: null,
        confidence: 0,
        suggestions: [],
        action: 'create',
        message: 'Empty supplier name'
      };
    }

    // Get all suppliers
    const suppliers = await this.getAllSuppliers();

    if (!suppliers || suppliers.length === 0) {
      return {
        matched: false,
        supplier: null,
        confidence: 0,
        suggestions: [],
        action: 'create',
        message: 'No suppliers in database'
      };
    }

    // Check for exact match first (case-insensitive)
    const exactMatch = suppliers.find(
      s => s.name.toLowerCase() === searchTerm.toLowerCase()
    );

    if (exactMatch) {
      return {
        matched: true,
        supplier: exactMatch,
        confidence: 1.0,
        suggestions: [],
        action: 'link',
        message: 'Exact match found'
      };
    }

    // Perform fuzzy search
    const fuse = new Fuse(suppliers, this.fuseOptions);
    const results = fuse.search(searchTerm);

    // Get top 5 suggestions
    const suggestions = results.slice(0, 5).map(result => ({
      supplier: result.item,
      confidence: 1 - result.score, // Convert score to confidence (0-1)
      score: result.score
    }));

    // Check if best match meets confidence threshold
    if (suggestions.length > 0 && suggestions[0].confidence >= confidenceThreshold) {
      return {
        matched: true,
        supplier: suggestions[0].supplier,
        confidence: suggestions[0].confidence,
        suggestions: suggestions.slice(1), // Other suggestions
        action: 'link',
        message: `Fuzzy match found (${(suggestions[0].confidence * 100).toFixed(0)}% confidence)`
      };
    }

    // No confident match - suggest creating new supplier
    return {
      matched: false,
      supplier: null,
      confidence: suggestions.length > 0 ? suggestions[0].confidence : 0,
      suggestions: suggestions,
      action: 'create',
      message: 'No confident match found - suggest creating new supplier'
    };
  }

  /**
   * Batch match multiple supplier names from CSV
   *
   * @param {Array<string>} supplierNames - Array of supplier names from CSV
   * @param {number} confidenceThreshold - Minimum confidence score
   * @returns {Object} Results with matched, unmatched, and suggestions
   */
  async batchMatchSuppliers(supplierNames, confidenceThreshold = 0.7) {
    const uniqueNames = [...new Set(supplierNames.filter(n => n && n.trim()))];

    const results = {
      matched: [],
      needsReview: [],
      needsCreation: [],
      errors: []
    };

    for (const name of uniqueNames) {
      try {
        const matchResult = await this.matchSupplier(name, confidenceThreshold);

        if (matchResult.matched) {
          results.matched.push({
            csvName: name,
            ...matchResult
          });
        } else if (matchResult.suggestions.length > 0) {
          results.needsReview.push({
            csvName: name,
            ...matchResult
          });
        } else {
          results.needsCreation.push({
            csvName: name,
            ...matchResult
          });
        }
      } catch (error) {
        results.errors.push({
          csvName: name,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Auto-create a new supplier from CSV data
   *
   * @param {string} supplierName - Supplier name from CSV
   * @param {Object} additionalData - Optional additional supplier data
   * @returns {Object} Created supplier record
   */
  async createSupplierFromCSV(supplierName, additionalData = {}) {
    if (!supplierName || typeof supplierName !== 'string') {
      throw new Error('Valid supplier name required');
    }

    const name = supplierName.trim();

    // STRICT CHECK: Check if supplier with this name already exists (case-insensitive)
    // This prevents duplicates when fuzzy match fails but exact name exists
    const { data: existingSupplier } = await supabase
      .from('suppliers')
      .select('*')
      .ilike('name', name)
      .maybeSingle();

    if (existingSupplier) {
      console.log(`[Supplier Creation] Found existing supplier "${name}" (ID: ${existingSupplier.id}) - skipping creation`);
      return existingSupplier;
    }

    // Generate short code from name (first 3-5 letters, uppercase)
    const shortCode = this.generateShortCode(name);

    // Check if short code already exists
    const existingCode = await this.checkShortCodeExists(shortCode);
    const finalShortCode = existingCode ? `${shortCode}${Math.floor(Math.random() * 99)}` : shortCode;

    const supplierData = {
      name: name,
      short_code: finalShortCode,
      is_active: true,
      notes: additionalData.notes || 'Auto-created from CSV import',
      address: additionalData.address || null,
      city: additionalData.city || null,
      state: additionalData.state || null,
      zip: additionalData.zip || additionalData.zip_code || null,
      phone: additionalData.phone || null,
      email: additionalData.email || null,
      website: additionalData.website || null,
      payment_terms: additionalData.payment_terms || 'Net 30',
      contact_name: additionalData.contact_name || null
    };

    try {
      const { data, error } = await supabase
        .from('suppliers')
        .insert([supplierData])
        .select()
        .single();

      if (error) throw error;

      // Clear cache to include new supplier
      this.cache.suppliers = null;

      return data;
    } catch (error) {
      console.error('Error creating supplier:', error);
      throw error;
    }
  }

  /**
   * Generate short code from supplier name
   * Takes first letters of each word, or first 3-5 chars if single word
   */
  generateShortCode(name) {
    const words = name.trim().toUpperCase().split(/\s+/);

    if (words.length >= 2) {
      // Multi-word: take first letter of each word (max 5)
      return words.slice(0, 5).map(w => w[0]).join('');
    } else {
      // Single word: take first 3-5 characters
      const word = words[0].replace(/[^A-Z0-9]/g, '');
      return word.substring(0, Math.min(5, word.length));
    }
  }

  /**
   * Check if short code already exists
   */
  async checkShortCodeExists(shortCode) {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('id')
        .eq('short_code', shortCode)
        .maybeSingle();

      if (error) throw error;
      return !!data;
    } catch (error) {
      console.error('Error checking short code:', error);
      return false;
    }
  }

  /**
   * Update equipment records with matched supplier IDs
   *
   * @param {Array<Object>} matches - Array of {equipmentId, supplierId} objects
   * @returns {Object} Update results
   */
  async linkEquipmentToSuppliers(matches) {
    const results = {
      success: [],
      failed: []
    };

    for (const match of matches) {
      try {
        const { error } = await supabase
          .from('project_equipment')
          .update({
            supplier_id: match.supplierId,
            updated_at: new Date().toISOString()
          })
          .eq('id', match.equipmentId);

        if (error) throw error;

        results.success.push(match);
      } catch (error) {
        results.failed.push({
          ...match,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Get supplier by ID
   */
  async getSupplierById(supplierId) {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('id', supplierId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching supplier:', error);
      return null;
    }
  }

  /**
   * Clear cache (useful after bulk operations)
   */
  clearCache() {
    this.cache.suppliers = null;
    this.cache.lastFetch = null;
  }
}

// Export singleton instance
export const fuzzyMatchService = new FuzzyMatchService();
export default fuzzyMatchService;
