/**
 * ContactsImportManager.js
 * Standalone component for importing contacts from CSV files
 *
 * Features:
 * - CSV file upload with auto-delimiter detection
 * - Smart field mapping with auto-detection
 * - AI-assisted parsing (optional)
 * - Duplicate handling (skip, merge, create)
 * - Batch processing with progress tracking
 */

import React, { useState } from 'react';
import {
  Upload, FileSpreadsheet, ArrowRight, ArrowLeft, X,
  Loader2, CheckCircle, AlertTriangle, RefreshCw, Sparkles
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Button from '../ui/Button';

// Available contact fields for mapping (matches contacts table schema)
const CONTACT_FIELDS = [
  { key: 'name', label: 'Name', required: true },
  { key: 'first_name', label: 'First Name', required: false },
  { key: 'last_name', label: 'Last Name', required: false },
  { key: 'email', label: 'Email', required: false },
  { key: 'phone', label: 'Phone', required: false },
  { key: 'company', label: 'Company', required: false },
  { key: 'role', label: 'Role/Title', required: false },
  { key: 'address', label: 'Full Address', required: false },
  { key: 'address1', label: 'Address Line 1', required: false },
  { key: 'address2', label: 'Address Line 2', required: false },
  { key: 'city', label: 'City', required: false },
  { key: 'state', label: 'State', required: false },
  { key: 'zip', label: 'ZIP Code', required: false }
];

const ContactsImportManager = () => {
  // CSV Import state
  const [csvData, setCsvData] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [fieldMapping, setFieldMapping] = useState({});
  const [importPreview, setImportPreview] = useState([]);
  const [importStep, setImportStep] = useState('upload'); // upload, map, preview, ai-processing, importing, done
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, skipped: 0, errors: [] });
  const [duplicateHandling, setDuplicateHandling] = useState('skip'); // skip, merge, create
  const [useAIProcessing, setUseAIProcessing] = useState(true);
  const [aiProcessedData, setAiProcessedData] = useState([]);
  const [error, setError] = useState(null);

  /**
   * Handle file upload
   */
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      parseCSV(text);
    };
    reader.readAsText(file);
  };

  /**
   * Parse CSV text into data
   */
  const parseCSV = (text) => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      setError('CSV must have at least a header row and one data row');
      return;
    }

    // Detect delimiter
    let delimiter = ',';
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i];
      const commas = (line.match(/,/g) || []).length;
      const tabs = (line.match(/\t/g) || []).length;
      const semis = (line.match(/;/g) || []).length;

      if (tabs > commas && tabs > semis && tabs >= 2) {
        delimiter = '\t';
        break;
      } else if (semis > commas && semis > tabs && semis >= 2) {
        delimiter = ';';
        break;
      } else if (commas >= 2) {
        delimiter = ',';
        break;
      }
    }

    // Parse a single row - handle quoted values
    const parseRow = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === delimiter && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    // Find header row
    const headerKeywords = ['name', 'email', 'phone', 'company', 'address', 'mobile', 'customer', 'contact', 'first', 'last'];
    let headerRowIndex = 0;

    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const parsed = parseRow(lines[i]);
      const nonEmptyCols = parsed.filter(col => col.trim()).length;

      if (nonEmptyCols >= 2) {
        const lowerRow = parsed.join(' ').toLowerCase();
        const matchCount = headerKeywords.filter(kw => lowerRow.includes(kw)).length;

        if (matchCount >= 2) {
          headerRowIndex = i;
          break;
        }
      }
    }

    const headers = parseRow(lines[headerRowIndex]);
    setCsvHeaders(headers);

    // Parse data rows
    const data = [];
    for (let i = headerRowIndex + 1; i < lines.length; i++) {
      const values = parseRow(lines[i]);
      const row = {};
      values.forEach((val, idx) => {
        if (idx < headers.length && headers[idx]) {
          row[headers[idx]] = val;
        }
      });
      if (Object.values(row).some(v => v && v.trim())) {
        data.push(row);
      }
    }

    setCsvData(data);

    // Auto-map fields
    const headerAliases = {
      name: ['name', 'full name', 'fullname', 'contact name', 'client name', 'display name'],
      first_name: ['first name', 'firstname', 'first', 'given name'],
      last_name: ['last name', 'lastname', 'last', 'surname', 'family name'],
      email: ['email', 'email address', 'e-mail', 'mail'],
      phone: ['phone', 'phone number', 'phone numbers', 'telephone', 'tel', 'mobile', 'cell', 'primary phone', 'work phone'],
      company: ['company', 'company name', 'organization', 'org', 'business', 'business name', 'employer', 'customer full name', 'customer name'],
      role: ['role', 'title', 'job title', 'position', 'job', 'occupation'],
      address: ['address', 'full address', 'street address', 'mailing address', 'bill address', 'billing address', 'ship address', 'shipping address', 'service address'],
      address1: ['address 1', 'address1', 'street', 'street 1', 'address line 1'],
      address2: ['address 2', 'address2', 'street 2', 'apt', 'suite', 'unit', 'address line 2'],
      city: ['city', 'town'],
      state: ['state', 'province', 'region', 'st'],
      zip: ['zip', 'zip code', 'zipcode', 'postal', 'postal code', 'postcode']
    };

    const autoMapping = {};

    // Exact matches first
    headers.forEach(header => {
      const lowerHeader = header.toLowerCase().trim();
      Object.entries(headerAliases).forEach(([fieldKey, aliases]) => {
        if (!autoMapping[fieldKey] && aliases.some(alias => lowerHeader === alias)) {
          autoMapping[fieldKey] = header;
        }
      });
    });

    // Then includes matches
    headers.forEach(header => {
      const lowerHeader = header.toLowerCase().trim();
      Object.entries(headerAliases).forEach(([fieldKey, aliases]) => {
        if (!autoMapping[fieldKey] && aliases.some(alias => lowerHeader.includes(alias))) {
          autoMapping[fieldKey] = header;
        }
      });
    });

    setFieldMapping(autoMapping);
    setImportStep('map');
  };

  /**
   * Handle mapping change
   */
  const handleMappingChange = (fieldKey, csvHeader) => {
    setFieldMapping(prev => ({
      ...prev,
      [fieldKey]: csvHeader || null
    }));
  };

  /**
   * Local parsing fallback when AI is unavailable
   */
  const parseContactsLocally = (contacts) => {
    return contacts.map(contact => {
      const parsed = { ...contact };

      // Try to parse first/last name from full name
      if (contact.name && (!contact.first_name || !contact.last_name)) {
        const nameParts = contact.name.trim().split(/\s+/);
        if (nameParts.length >= 2) {
          parsed.first_name = parsed.first_name || nameParts[0];
          parsed.last_name = parsed.last_name || nameParts.slice(1).join(' ');
        } else if (nameParts.length === 1) {
          parsed.first_name = parsed.first_name || nameParts[0];
        }
      }

      // Detect if it looks like a company
      parsed.is_company = !!(contact.company && !contact.first_name && !contact.last_name);

      return parsed;
    });
  };

  /**
   * Generate preview / process with AI
   */
  const generatePreview = async () => {
    const mappedData = csvData.map(row => {
      const mapped = {};
      Object.entries(fieldMapping).forEach(([fieldKey, csvHeader]) => {
        if (csvHeader) {
          mapped[fieldKey] = row[csvHeader] || '';
        }
      });
      return mapped;
    });

    if (useAIProcessing) {
      setImportStep('ai-processing');
      try {
        const response = await fetch('/api/ai/parse-contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contacts: mappedData })
        });

        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }

        const result = await response.json();

        if (result.success && result.contacts) {
          setAiProcessedData(result.contacts);
          setImportPreview(result.contacts.slice(0, 5));
        } else {
          const localParsed = parseContactsLocally(mappedData);
          setAiProcessedData(localParsed);
          setImportPreview(localParsed.slice(0, 5));
        }
      } catch (err) {
        console.error('[ContactsImportManager] AI processing error:', err);
        const localParsed = parseContactsLocally(mappedData);
        setAiProcessedData(localParsed);
        setImportPreview(localParsed.slice(0, 5));
      }
    } else {
      setAiProcessedData(mappedData);
      setImportPreview(mappedData.slice(0, 5));
    }

    setImportStep('preview');
  };

  /**
   * Fetch all existing contacts for duplicate checking
   */
  const fetchAllExistingContacts = async () => {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, name, email, phone, company');
    if (error) {
      console.error('[ContactsImportManager] Failed to fetch existing contacts:', error);
      return [];
    }
    return data || [];
  };

  /**
   * Check for duplicate in memory
   */
  const checkDuplicateInMemory = (contact, existingContacts) => {
    if (contact.email) {
      const emailLower = contact.email.toLowerCase();
      const match = existingContacts.find(c => c.email?.toLowerCase() === emailLower);
      if (match) return match;
    }

    if (contact.phone) {
      const normalizedPhone = contact.phone.replace(/\D/g, '');
      if (normalizedPhone.length >= 7) {
        const last7 = normalizedPhone.slice(-7);
        const match = existingContacts.find(c => {
          if (!c.phone) return false;
          const existingLast7 = c.phone.replace(/\D/g, '').slice(-7);
          return existingLast7 === last7;
        });
        if (match) return match;
      }
    }

    return null;
  };

  /**
   * Run the import
   */
  const runImport = async () => {
    const dataToImport = aiProcessedData.length > 0 ? aiProcessedData : csvData.map(row => {
      const mapped = {};
      Object.entries(fieldMapping).forEach(([fieldKey, csvHeader]) => {
        if (csvHeader && row[csvHeader]) {
          mapped[fieldKey] = row[csvHeader];
        }
      });
      return mapped;
    });

    setImportStep('importing');
    setImportProgress({ current: 0, total: dataToImport.length, skipped: 0, errors: [] });

    const errors = [];
    let skipped = 0;

    const existingContacts = await fetchAllExistingContacts();

    const validColumns = ['name', 'full_name', 'first_name', 'last_name', 'email', 'phone', 'company', 'role',
                         'address', 'address1', 'address2', 'city', 'state', 'zip', 'notes',
                         'is_internal', 'is_active'];

    const contactsToInsert = [];
    const contactsToMerge = [];

    const looksLikeAddress = (str) => {
      if (!str) return false;
      return (
        /^\d+\s/.test(str) ||
        /\d{5}/.test(str) ||
        /\b(street|st\.|ave|avenue|drive|dr\.|road|rd\.|lane|ln\.|blvd|court|ct\.|way|place|pl\.|highway|hwy)\b/i.test(str) ||
        /\b(fl|in|ca|tx|ny|oh|pa|il|ga|nc)\s+\d{4,5}/i.test(str) ||
        /,\s*(fl|in|ca|tx|ny|oh|pa|il|usa|united states)\s*$/i.test(str) ||
        /\bpo\s*box\b/i.test(str)
      );
    };

    for (let i = 0; i < dataToImport.length; i++) {
      const contact = { ...dataToImport[i] };

      if (!contact.name) {
        if (contact.first_name || contact.last_name) {
          contact.name = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
        } else if (contact.company && !looksLikeAddress(contact.company)) {
          contact.name = contact.company;
        }
      }

      if (contact.name && looksLikeAddress(contact.name)) {
        contact.name = null;
      }

      if (!contact.name) {
        if (!contact.email && !contact.phone) {
          errors.push({ row: i + 2, error: 'No valid name found' });
          skipped++;
          continue;
        }
        if (contact.email) {
          const emailPrefix = contact.email.split('@')[0].replace(/[._-]/g, ' ');
          contact.name = emailPrefix.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        } else {
          contact.name = contact.phone || 'Unknown Contact';
        }
      }

      const cleanContact = {};
      validColumns.forEach(col => {
        if (contact[col] !== undefined && contact[col] !== null && contact[col] !== '') {
          cleanContact[col] = contact[col];
        }
      });

      if (!cleanContact.full_name) {
        cleanContact.full_name = cleanContact.name;
      }

      const existing = checkDuplicateInMemory(contact, existingContacts);

      if (existing) {
        if (duplicateHandling === 'skip') {
          skipped++;
        } else if (duplicateHandling === 'merge') {
          contactsToMerge.push({ row: i + 2, cleanContact, existingId: existing.id, existing });
        } else if (duplicateHandling === 'create') {
          contactsToInsert.push({ row: i + 2, cleanContact });
        }
      } else {
        contactsToInsert.push({ row: i + 2, cleanContact });
      }

      if (i % 50 === 0) {
        setImportProgress(prev => ({ ...prev, current: i + 1, skipped, errors: [...errors] }));
      }
    }

    // Batch insert
    const BATCH_SIZE = 50;
    for (let i = 0; i < contactsToInsert.length; i += BATCH_SIZE) {
      const batch = contactsToInsert.slice(i, i + BATCH_SIZE);
      const contactsData = batch.map(b => b.cleanContact);

      const { error: insertError } = await supabase.from('contacts').insert(contactsData);
      if (insertError) {
        for (const item of batch) {
          const { error: singleError } = await supabase.from('contacts').insert([item.cleanContact]);
          if (singleError) {
            errors.push({ row: item.row, error: `Insert failed: ${singleError.message}` });
          }
        }
      }

      setImportProgress(prev => ({
        ...prev,
        current: dataToImport.length - contactsToMerge.length + Math.min(i + BATCH_SIZE, contactsToInsert.length),
        skipped,
        errors: [...errors]
      }));
    }

    // Process merges
    for (const { row, cleanContact, existingId, existing } of contactsToMerge) {
      const updates = {};
      Object.entries(cleanContact).forEach(([key, value]) => {
        if (value && !existing[key]) {
          updates[key] = value;
        }
      });

      if (Object.keys(updates).length > 0) {
        const { error: mergeError } = await supabase
          .from('contacts')
          .update(updates)
          .eq('id', existingId);
        if (mergeError) {
          errors.push({ row, error: `Merge failed: ${mergeError.message}` });
        }
      } else {
        skipped++;
      }
    }

    setImportProgress({ current: dataToImport.length, total: dataToImport.length, skipped, errors });
    setImportStep('done');
  };

  /**
   * Reset import state
   */
  const resetImport = () => {
    setCsvData([]);
    setCsvHeaders([]);
    setFieldMapping({});
    setImportPreview([]);
    setImportStep('upload');
    setImportProgress({ current: 0, total: 0, skipped: 0, errors: [] });
    setAiProcessedData([]);
    setError(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Import Contacts</h2>
        <p className="text-sm text-zinc-500">Import contacts from CSV file with duplicate detection and field mapping.</p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Progress Steps */}
      <div className="flex items-center gap-2 text-sm flex-wrap">
        {['upload', 'map', 'ai-processing', 'preview', 'importing', 'done'].map((step, idx) => (
          <React.Fragment key={step}>
            <div
              className={`flex items-center gap-1 ${
                importStep === step ? 'text-violet-600 font-medium' :
                ['upload', 'map', 'ai-processing', 'preview', 'importing', 'done'].indexOf(importStep) > idx ? '' : 'text-zinc-400'
              }`}
              style={['upload', 'map', 'ai-processing', 'preview', 'importing', 'done'].indexOf(importStep) > idx && importStep !== step ? { color: '#94AF32' } : {}}
            >
              {['upload', 'map', 'ai-processing', 'preview', 'importing', 'done'].indexOf(importStep) > idx ? (
                <CheckCircle size={16} />
              ) : importStep === step && step === 'ai-processing' ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <span className="w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs">
                  {idx + 1}
                </span>
              )}
              <span className="capitalize">{step === 'ai-processing' ? 'AI Parse' : step}</span>
            </div>
            {idx < 5 && <ArrowRight size={14} className="text-zinc-300" />}
          </React.Fragment>
        ))}
      </div>

      {/* Step 1: Upload */}
      {importStep === 'upload' && (
        <div className="rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-600 p-8 text-center">
          <FileSpreadsheet size={48} className="mx-auto mb-4 text-zinc-400" />
          <h3 className="font-medium text-zinc-700 dark:text-zinc-300 mb-2">Upload CSV File</h3>
          <p className="text-sm text-zinc-500 mb-4">Select a CSV file containing contact information</p>
          <label className="inline-flex items-center gap-2 px-4 py-2 bg-violet-500 text-white rounded-lg cursor-pointer hover:bg-violet-600 transition-colors">
            <Upload size={16} />
            Choose File
            <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
          </label>
          <p className="text-xs text-zinc-400 mt-4">
            CSV should have headers in the first row. Supported fields: Name, Email, Phone, Company, Role, Address, Notes
          </p>
        </div>
      )}

      {/* Step 2: Map Fields */}
      {importStep === 'map' && (
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              <strong>{csvData.length}</strong> records found. Map your CSV columns to contact fields below.
            </p>
          </div>

          <div className="grid gap-3">
            {CONTACT_FIELDS.map(field => (
              <div key={field.key} className="flex items-center gap-4">
                <div className="w-32 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </div>
                <ArrowRight size={16} className="text-zinc-400" />
                <select
                  value={fieldMapping[field.key] || ''}
                  onChange={(e) => handleMappingChange(field.key, e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm"
                >
                  <option value="">-- Don't import --</option>
                  {csvHeaders.map(header => (
                    <option key={header} value={header}>{header}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* Duplicate Handling */}
          <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-700">
            <h4 className="font-medium text-sm mb-3">Duplicate Handling</h4>
            <div className="flex gap-4">
              {[
                { id: 'skip', label: 'Skip duplicates', desc: 'Keep existing, ignore new' },
                { id: 'merge', label: 'Merge', desc: 'Fill empty fields only' },
                { id: 'create', label: 'Create new', desc: 'Allow duplicates' }
              ].map(opt => (
                <label key={opt.id} className={`flex-1 p-3 rounded-lg border cursor-pointer transition-colors ${
                  duplicateHandling === opt.id
                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                    : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                }`}>
                  <input
                    type="radio"
                    name="duplicateHandling"
                    value={opt.id}
                    checked={duplicateHandling === opt.id}
                    onChange={(e) => setDuplicateHandling(e.target.value)}
                    className="sr-only"
                  />
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-xs text-zinc-500">{opt.desc}</div>
                </label>
              ))}
            </div>
          </div>

          {/* AI Processing Toggle */}
          <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-900/10 dark:to-blue-900/10">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={useAIProcessing}
                onChange={(e) => setUseAIProcessing(e.target.checked)}
                className="w-5 h-5 rounded border-zinc-300 text-violet-600 focus:ring-violet-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-violet-500" />
                  <span className="font-medium text-sm">AI-Assisted Import</span>
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  Use Gemini AI to parse names (first/last), extract phone numbers from complex formats,
                  and identify companies vs. people
                </p>
              </div>
            </label>
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" onClick={resetImport}>
              <X size={16} />
              Cancel
            </Button>
            <Button onClick={generatePreview} disabled={!fieldMapping.name}>
              {useAIProcessing ? <Sparkles size={16} /> : <ArrowRight size={16} />}
              {useAIProcessing ? 'Process with AI' : 'Preview Import'}
            </Button>
          </div>
        </div>
      )}

      {/* Step: AI Processing */}
      {importStep === 'ai-processing' && (
        <div className="rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 p-8 text-center">
          <Loader2 size={48} className="mx-auto mb-4 text-violet-500 animate-spin" />
          <h3 className="font-medium text-violet-700 dark:text-violet-300 mb-2">AI Processing Contacts</h3>
          <p className="text-sm text-violet-600 dark:text-violet-400">
            Gemini is parsing names, phone numbers, and identifying contact types...
          </p>
          <p className="text-xs text-zinc-500 mt-4">
            Processing {csvData.length} contacts in batches
          </p>
        </div>
      )}

      {/* Step 3: Preview */}
      {importStep === 'preview' && (
        <div className="space-y-4">
          <div
            className="p-4 rounded-lg border"
            style={useAIProcessing && aiProcessedData.length > 0
              ? { backgroundColor: 'rgba(148, 175, 50, 0.1)', borderColor: 'rgba(148, 175, 50, 0.3)' }
              : { backgroundColor: 'rgba(245, 158, 11, 0.1)', borderColor: 'rgba(245, 158, 11, 0.3)' }
            }
          >
            <p
              className="text-sm"
              style={useAIProcessing && aiProcessedData.length > 0
                ? { color: '#94AF32' }
                : { color: '#F59E0B' }
              }
            >
              {useAIProcessing && aiProcessedData.length > 0 ? (
                <>
                  <Sparkles size={14} className="inline mr-1" />
                  AI processed <strong>{aiProcessedData.length}</strong> contacts. Preview below shows parsed data.
                </>
              ) : (
                <>Preview of first 5 records. Ready to import <strong>{csvData.length}</strong> contacts.</>
              )}
            </p>
          </div>

          <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-700 rounded-lg">
            <table className="min-w-max w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800">
                  <th className="text-left p-2 font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">Name</th>
                  <th className="text-left p-2 font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">First</th>
                  <th className="text-left p-2 font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">Last</th>
                  <th className="text-left p-2 font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">Email</th>
                  <th className="text-left p-2 font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">Phone</th>
                  <th className="text-left p-2 font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">Company</th>
                  <th className="text-left p-2 font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">Address</th>
                  <th className="text-left p-2 font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">Role</th>
                  <th className="text-left p-2 font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">Notes</th>
                  {useAIProcessing && <th className="text-left p-2 font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">Type</th>}
                </tr>
              </thead>
              <tbody>
                {importPreview.map((row, idx) => (
                  <tr key={idx} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="p-2 text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{row.name || '-'}</td>
                    <td className="p-2 text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{row.first_name || '-'}</td>
                    <td className="p-2 text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{row.last_name || '-'}</td>
                    <td className="p-2 text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{row.email || '-'}</td>
                    <td className="p-2 text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{row.phone || '-'}</td>
                    <td className="p-2 text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{row.company || '-'}</td>
                    <td className="p-2 text-zinc-700 dark:text-zinc-300 whitespace-nowrap max-w-xs truncate" title={row.address || row.address1 || ''}>{row.address || row.address1 || '-'}</td>
                    <td className="p-2 text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{row.role || '-'}</td>
                    <td className="p-2 text-zinc-700 dark:text-zinc-300 whitespace-nowrap max-w-xs truncate" title={row.notes || ''}>{row.notes || '-'}</td>
                    {useAIProcessing && (
                      <td className="p-2 whitespace-nowrap">
                        {row.is_company ? (
                          <span className="px-2 py-1 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">Company</span>
                        ) : (
                          <span className="px-2 py-1 text-xs rounded-full" style={{ backgroundColor: 'rgba(148, 175, 50, 0.2)', color: '#94AF32' }}>Person</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setImportStep('map')}>
              <ArrowLeft size={16} />
              Back
            </Button>
            <Button onClick={runImport}>
              <Upload size={16} />
              Import Contacts
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Importing */}
      {importStep === 'importing' && (
        <div className="space-y-4 text-center py-8">
          <Loader2 size={48} className="mx-auto animate-spin text-violet-500" />
          <h3 className="font-medium text-lg">Importing contacts...</h3>
          <div className="w-full max-w-md mx-auto">
            <div className="h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-violet-500 transition-all duration-300"
                style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
              />
            </div>
            <p className="text-sm text-zinc-500 mt-2">
              {importProgress.current} of {importProgress.total} processed
              {importProgress.skipped > 0 && ` (${importProgress.skipped} skipped)`}
            </p>
          </div>
        </div>
      )}

      {/* Step 5: Done */}
      {importStep === 'done' && (
        <div className="space-y-4 text-center py-8">
          <CheckCircle size={48} className="mx-auto" style={{ color: '#94AF32' }} />
          <h3 className="font-medium text-lg">Import Complete!</h3>
          <p className="text-zinc-600 dark:text-zinc-400">
            Processed {importProgress.total} records.
            {importProgress.skipped > 0 && ` ${importProgress.skipped} skipped.`}
            {importProgress.errors.length > 0 && ` ${importProgress.errors.length} errors.`}
          </p>

          {importProgress.errors.length > 0 && (
            <div className="text-left max-w-md mx-auto p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <h4 className="font-medium text-red-700 dark:text-red-300 mb-2 flex items-center gap-2">
                <AlertTriangle size={16} />
                Errors
              </h4>
              <ul className="text-sm text-red-600 dark:text-red-400 space-y-1">
                {importProgress.errors.slice(0, 5).map((err, idx) => (
                  <li key={idx}>Row {err.row}: {err.error}</li>
                ))}
                {importProgress.errors.length > 5 && (
                  <li>...and {importProgress.errors.length - 5} more</li>
                )}
              </ul>
            </div>
          )}

          <Button onClick={resetImport}>
            <RefreshCw size={16} />
            Import More
          </Button>
        </div>
      )}
    </div>
  );
};

export default ContactsImportManager;
