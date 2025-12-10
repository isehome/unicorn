import React, { useState, useEffect } from 'react';
import { permitService } from '../services/permitService';
import Button from './ui/Button';
import {
  Upload,
  Trash2,
  FileText,
  AlertCircle,
  Loader
} from 'lucide-react';

/**
 * PermitForm Component
 * Form for creating and editing project permits
 */
function PermitForm({ projectId, permit, onSubmit, onCancel }) {
  const [formData, setFormData] = useState({
    permit_number: '',
    notes: '',
    rough_in_date: '',
    final_inspection_date: ''
  });
  const [documentFile, setDocumentFile] = useState(null);
  const [existingDocument, setExistingDocument] = useState(null);
  const [removeExistingDocument, setRemoveExistingDocument] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (permit) {
      setFormData({
        permit_number: permit.permit_number || '',
        notes: permit.notes || '',
        rough_in_date: permit.rough_in_date || '',
        final_inspection_date: permit.final_inspection_date || ''
      });

      if (permit.permit_document_url) {
        setExistingDocument({
          url: permit.permit_document_url,
          name: permit.permit_document_name || 'Permit Document'
        });
      }
    }
  }, [permit]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      if (file.type !== 'application/pdf') {
        setError('Only PDF files are allowed for permit documents');
        return;
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB');
        return;
      }

      setDocumentFile(file);
      setError(null);

      // If editing and selecting new file, mark existing for removal
      if (existingDocument) {
        setRemoveExistingDocument(true);
      }
    }
  };

  const handleRemoveFile = () => {
    setDocumentFile(null);
    setRemoveExistingDocument(false);
  };

  const handleRemoveExistingDocument = () => {
    setRemoveExistingDocument(true);
    setExistingDocument(null);
  };

  const validateForm = () => {
    if (!formData.permit_number.trim()) {
      setError('Permit number is required');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const permitData = {
        project_id: projectId,
        permit_number: formData.permit_number.trim(),
        notes: formData.notes.trim() || null,
        rough_in_date: formData.rough_in_date || null,
        final_inspection_date: formData.final_inspection_date || null
      };

      if (permit) {
        // Update existing permit
        let fileToUpload = null;

        // If new file selected, use it
        if (documentFile) {
          fileToUpload = documentFile;
        }
        // If removing existing document, set to null
        else if (removeExistingDocument) {
          permitData.permit_document_url = null;
          permitData.permit_document_name = null;
        }

        await permitService.updatePermit(permit.id, permitData, fileToUpload);
      } else {
        // Create new permit
        await permitService.createPermit(permitData, documentFile);
      }

      onSubmit();
    } catch (err) {
      console.error('Error saving permit:', err);
      setError(err.message || 'Failed to save permit. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200"
          >
            ×
          </button>
        </div>
      )}

      <div>
        <label htmlFor="permit_number" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Permit Number <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="permit_number"
          name="permit_number"
          value={formData.permit_number}
          onChange={handleChange}
          required
          disabled={loading}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          placeholder="Enter permit number"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Official permit number from building department
        </p>
      </div>

      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          disabled={loading}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed resize-none"
          placeholder="Optional notes about this permit"
        />
      </div>

      {/* Document Upload Section */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Permit Document (PDF)
        </label>

        {/* Show existing document if available and not marked for removal */}
        {existingDocument && !removeExistingDocument && !documentFile && (
          <div className="mb-3 flex items-center gap-2 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-zinc-900/50">
            <FileText className="w-5 h-5 text-red-500 flex-shrink-0" />
            <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">
              {existingDocument.name}
            </span>
            <button
              type="button"
              onClick={handleRemoveExistingDocument}
              disabled={loading}
              className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:opacity-50"
              title="Remove document"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Show new file if selected */}
        {documentFile && (
          <div className="mb-3 flex items-center gap-2 p-3 border-2 border-violet-500 rounded-lg bg-violet-50 dark:bg-violet-900/20">
            <FileText className="w-5 h-5 text-red-500 flex-shrink-0" />
            <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">
              {documentFile.name}
            </span>
            <button
              type="button"
              onClick={handleRemoveFile}
              disabled={loading}
              className="p-1 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded disabled:opacity-50"
              title="Remove file"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Upload button - show if no file selected or replacing existing */}
        {!documentFile && (
          <div>
            <label
              htmlFor="document-upload"
              className={`flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors ${
                loading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <Upload className="w-5 h-5" />
              <span className="text-sm font-medium">
                {existingDocument && !removeExistingDocument ? 'Replace Document' : 'Upload Permit Document'}
              </span>
              <input
                type="file"
                id="document-upload"
                accept="application/pdf"
                onChange={handleFileSelect}
                disabled={loading}
                className="hidden"
              />
            </label>
          </div>
        )}

        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          PDF files only, maximum 10MB
        </p>
      </div>

      {/* Inspection Dates - Optional fields for initial setup */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Inspection Dates (Optional)
        </h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          You can set these dates now or use the checkboxes later to mark inspections complete
        </p>

        <div className="space-y-3">
          <div>
            <label htmlFor="rough_in_date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Rough-In Inspection Date
            </label>
            <input
              type="date"
              id="rough_in_date"
              name="rough_in_date"
              value={formData.rough_in_date}
              onChange={handleChange}
              disabled={loading}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          <div>
            <label htmlFor="final_inspection_date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Final Inspection Date
            </label>
            <input
              type="date"
              id="final_inspection_date"
              name="final_inspection_date"
              value={formData.final_inspection_date}
              onChange={handleChange}
              disabled={loading}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={loading}
          icon={loading ? Loader : null}
        >
          {loading ? 'Saving...' : permit ? 'Update Permit' : 'Add Permit'}
        </Button>
      </div>
    </form>
  );
}

export default PermitForm;
