import React, { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  Sparkles,
  Check,
  X,
  Edit3,
  ExternalLink,
  Zap,
  Network,
  BatteryCharging,
  FileText,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw
} from 'lucide-react';
import Button from './ui/Button';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';

/**
 * Modal for reviewing AI-enriched data on global parts
 *
 * Shows a side-by-side comparison of AI suggestions vs current values,
 * with approve/reject/edit actions and feedback capability.
 */
const GlobalPartAIReviewModal = ({ part, onSave, onCancel }) => {
  const { mode } = useTheme();
  const isDark = mode === 'dark';

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [showSources, setShowSources] = useState(false);

  // Editable fields (initialize with AI suggestions or current values)
  const aiData = part?.ai_enrichment_data || {};
  const [editedValues, setEditedValues] = useState({
    power_watts: aiData.power_watts ?? part?.power_watts ?? null,
    total_ports: aiData.total_ports ?? part?.total_ports ?? null,
    poe_ports: aiData.poe_ports ?? part?.poe_ports ?? null,
    poe_port_list: aiData.poe_port_list ?? part?.poe_port_list ?? '',
    ups_battery_outlets: aiData.ups_battery_outlets ?? part?.ups_battery_outlets ?? null,
    ups_surge_only_outlets: aiData.ups_surge_only_outlets ?? part?.ups_surge_only_outlets ?? null,
  });

  const handleFieldChange = (field, value) => {
    setEditedValues(prev => ({
      ...prev,
      [field]: value === '' ? null : value
    }));
  };

  const handleApprove = useCallback(async () => {
    setSaving(true);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc('review_part_enrichment', {
        p_part_id: part.id,
        p_action: 'approve',
        p_feedback: feedbackText ? { text: feedbackText } : null,
        p_corrections: null
      });

      if (rpcError) throw rpcError;

      // Dispatch event to refresh parts list
      window.dispatchEvent(new CustomEvent('ai-review-completed'));

      if (onSave) {
        onSave({ ...part, ai_enrichment_status: 'approved' });
      }
    } catch (err) {
      console.error('Failed to approve:', err);
      setError(err.message || 'Failed to approve enrichment');
    } finally {
      setSaving(false);
    }
  }, [part, feedbackText, onSave]);

  const handleReject = useCallback(async () => {
    setSaving(true);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc('review_part_enrichment', {
        p_part_id: part.id,
        p_action: 'reject',
        p_feedback: feedbackText ? { text: feedbackText, reason: 'rejected' } : null,
        p_corrections: null
      });

      if (rpcError) throw rpcError;

      window.dispatchEvent(new CustomEvent('ai-review-completed'));

      if (onSave) {
        onSave({ ...part, ai_enrichment_status: 'rejected' });
      }
    } catch (err) {
      console.error('Failed to reject:', err);
      setError(err.message || 'Failed to reject enrichment');
    } finally {
      setSaving(false);
    }
  }, [part, feedbackText, onSave]);

  const handleSaveWithEdits = useCallback(async () => {
    setSaving(true);
    setError(null);

    try {
      // Build corrections object with only changed values
      const corrections = {};
      Object.keys(editedValues).forEach(key => {
        const editedVal = editedValues[key];
        const aiVal = aiData[key];
        if (editedVal !== aiVal) {
          corrections[key] = editedVal;
        }
      });

      const { data, error: rpcError } = await supabase.rpc('review_part_enrichment', {
        p_part_id: part.id,
        p_action: 'edit',
        p_feedback: {
          text: feedbackText || 'Values corrected by human',
          corrections: Object.keys(corrections).map(key => ({
            field: key,
            ai_suggested: aiData[key],
            human_corrected: corrections[key]
          }))
        },
        p_corrections: Object.keys(corrections).length > 0 ? corrections : null
      });

      if (rpcError) throw rpcError;

      window.dispatchEvent(new CustomEvent('ai-review-completed'));

      if (onSave) {
        onSave({ ...part, ...corrections, ai_enrichment_status: 'edited' });
      }
    } catch (err) {
      console.error('Failed to save edits:', err);
      setError(err.message || 'Failed to save edits');
    } finally {
      setSaving(false);
    }
  }, [part, editedValues, aiData, feedbackText, onSave]);

  const handleResetForReEnrichment = useCallback(async () => {
    setSaving(true);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc('reset_part_enrichment', {
        p_part_id: part.id
      });

      if (rpcError) throw rpcError;

      window.dispatchEvent(new CustomEvent('ai-review-completed'));

      if (onSave) {
        onSave({ ...part, ai_enrichment_status: 'pending' });
      }
    } catch (err) {
      console.error('Failed to reset:', err);
      setError(err.message || 'Failed to reset for re-enrichment');
    } finally {
      setSaving(false);
    }
  }, [part, onSave]);

  // Confidence indicator
  const confidence = part?.ai_enrichment_confidence || 0;
  const confidenceColor = confidence >= 0.8 ? 'text-green-600' :
    confidence >= 0.5 ? 'text-yellow-600' : 'text-red-600';
  const confidenceLabel = confidence >= 0.8 ? 'High' :
    confidence >= 0.5 ? 'Medium' : 'Low';

  // Check if user made any edits
  const hasEdits = Object.keys(editedValues).some(key =>
    editedValues[key] !== (aiData[key] ?? part?.[key] ?? null)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            AI Enrichment Review
          </h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {part?.name || part?.part_number}
          </p>
          {part?.manufacturer && (
            <p className="text-xs text-gray-500 dark:text-gray-500">
              {part.manufacturer} {part.model && `• ${part.model}`}
            </p>
          )}
        </div>

        {/* Confidence Badge */}
        <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 ${
          isDark ? 'bg-gray-800' : 'bg-gray-100'
        }`}>
          <Sparkles className={`h-4 w-4 ${confidenceColor}`} />
          <span className={`text-sm font-medium ${confidenceColor}`}>
            {Math.round(confidence * 100)}% Confidence
          </span>
          <span className={`text-xs ${confidenceColor}`}>
            ({confidenceLabel})
          </span>
        </div>
      </div>

      {/* AI Notes */}
      {part?.ai_enrichment_notes && (
        <div className={`rounded-lg p-3 ${
          isDark ? 'bg-blue-900/20 border border-blue-800' : 'bg-blue-50 border border-blue-200'
        }`}>
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 text-blue-500 shrink-0" />
            <p className="text-sm text-blue-700 dark:text-blue-300">
              {part.ai_enrichment_notes}
            </p>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className={`rounded-lg p-3 ${
          isDark ? 'bg-red-900/20 border border-red-800' : 'bg-red-50 border border-red-200'
        }`}>
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Enrichment Fields */}
      <div className="space-y-4">
        {/* Power Section */}
        <FieldSection
          icon={<Zap className="h-4 w-4 text-yellow-500" />}
          title="Power Consumption"
          isDark={isDark}
        >
          <EditableField
            label="Watts"
            aiValue={aiData.power_watts}
            currentValue={part?.power_watts}
            editedValue={editedValues.power_watts}
            onChange={(v) => handleFieldChange('power_watts', v ? parseFloat(v) : null)}
            type="number"
            isDark={isDark}
          />
        </FieldSection>

        {/* Network Ports Section */}
        <FieldSection
          icon={<Network className="h-4 w-4 text-blue-500" />}
          title="Network Ports"
          isDark={isDark}
        >
          <div className="grid grid-cols-3 gap-4">
            <EditableField
              label="Total Ports"
              aiValue={aiData.total_ports}
              currentValue={part?.total_ports}
              editedValue={editedValues.total_ports}
              onChange={(v) => handleFieldChange('total_ports', v ? parseInt(v) : null)}
              type="number"
              isDark={isDark}
            />
            <EditableField
              label="POE Ports"
              aiValue={aiData.poe_ports}
              currentValue={part?.poe_ports}
              editedValue={editedValues.poe_ports}
              onChange={(v) => handleFieldChange('poe_ports', v ? parseInt(v) : null)}
              type="number"
              isDark={isDark}
            />
            <EditableField
              label="POE Port List"
              aiValue={aiData.poe_port_list}
              currentValue={part?.poe_port_list}
              editedValue={editedValues.poe_port_list}
              onChange={(v) => handleFieldChange('poe_port_list', v)}
              placeholder="e.g. 1-8"
              isDark={isDark}
            />
          </div>
        </FieldSection>

        {/* UPS Section */}
        <FieldSection
          icon={<BatteryCharging className="h-4 w-4 text-green-500" />}
          title="UPS Outlets"
          isDark={isDark}
        >
          <div className="grid grid-cols-2 gap-4">
            <EditableField
              label="Battery Backup"
              aiValue={aiData.ups_battery_outlets}
              currentValue={part?.ups_battery_outlets}
              editedValue={editedValues.ups_battery_outlets}
              onChange={(v) => handleFieldChange('ups_battery_outlets', v ? parseInt(v) : null)}
              type="number"
              isDark={isDark}
            />
            <EditableField
              label="Surge Only"
              aiValue={aiData.ups_surge_only_outlets}
              currentValue={part?.ups_surge_only_outlets}
              editedValue={editedValues.ups_surge_only_outlets}
              onChange={(v) => handleFieldChange('ups_surge_only_outlets', v ? parseInt(v) : null)}
              type="number"
              isDark={isDark}
            />
          </div>
        </FieldSection>

        {/* Documentation Links (Read-only display) */}
        {(aiData.install_manual_urls?.length > 0 || aiData.user_guide_urls?.length > 0) && (
          <FieldSection
            icon={<FileText className="h-4 w-4 text-purple-500" />}
            title="Documentation Found"
            isDark={isDark}
          >
            <div className="space-y-2">
              {aiData.install_manual_urls?.map((url, i) => (
                <LinkDisplay key={`install-${i}`} label="Install Manual" url={url} isDark={isDark} />
              ))}
              {aiData.user_guide_urls?.map((url, i) => (
                <LinkDisplay key={`guide-${i}`} label="User Guide" url={url} isDark={isDark} />
              ))}
            </div>
          </FieldSection>
        )}

        {/* Sources */}
        {aiData.sources?.length > 0 && (
          <div className={`rounded-lg border ${
            isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'
          }`}>
            <button
              onClick={() => setShowSources(!showSources)}
              className="flex w-full items-center justify-between p-3 text-left"
            >
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Sources ({aiData.sources.length})
              </span>
              {showSources ? (
                <ChevronUp className="h-4 w-4 text-gray-500" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-500" />
              )}
            </button>
            {showSources && (
              <div className="border-t border-gray-200 dark:border-gray-700 p-3 space-y-1">
                {aiData.sources.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {new URL(url).hostname}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Feedback Text */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Feedback (optional)
        </label>
        <textarea
          value={feedbackText}
          onChange={(e) => setFeedbackText(e.target.value)}
          placeholder="Add notes about corrections or issues with the AI data..."
          rows={2}
          className={`w-full rounded-lg border px-3 py-2 text-sm ${
            isDark
              ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400'
              : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500'
          } focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500`}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 pt-4">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleResetForReEnrichment}
          disabled={saving}
        >
          <RefreshCw className="h-4 w-4 mr-1" />
          Re-enrich
        </Button>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </Button>

          <Button
            variant="secondary"
            onClick={handleReject}
            disabled={saving}
            className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            <X className="h-4 w-4 mr-1" />
            Reject
          </Button>

          {hasEdits ? (
            <Button
              variant="primary"
              onClick={handleSaveWithEdits}
              disabled={saving}
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Saving...
                </span>
              ) : (
                <>
                  <Edit3 className="h-4 w-4 mr-1" />
                  Save Edits
                </>
              )}
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleApprove}
              disabled={saving}
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Approving...
                </span>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Approve
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

// Sub-components

const FieldSection = ({ icon, title, children, isDark }) => (
  <div className={`rounded-lg border p-4 ${
    isDark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-200 bg-white'
  }`}>
    <div className="flex items-center gap-2 mb-3">
      {icon}
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {title}
      </span>
    </div>
    {children}
  </div>
);

const EditableField = ({
  label,
  aiValue,
  currentValue,
  editedValue,
  onChange,
  type = 'text',
  placeholder = '',
  isDark
}) => {
  const hasAiValue = aiValue !== null && aiValue !== undefined;
  const hasCurrentValue = currentValue !== null && currentValue !== undefined;
  const isChanged = editedValue !== aiValue && editedValue !== currentValue;

  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
        {label}
      </label>
      <div className="relative">
        <input
          type={type}
          value={editedValue ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || (hasAiValue ? String(aiValue) : '-')}
          className={`w-full rounded-lg border px-3 py-2 text-sm ${
            isChanged
              ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20'
              : isDark
                ? 'border-gray-600 bg-gray-700 text-white'
                : 'border-gray-300 bg-white text-gray-900'
          } focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500`}
        />
        {isChanged && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-yellow-600 dark:text-yellow-400">
            edited
          </span>
        )}
      </div>
      {/* Show comparison */}
      <div className="mt-1 flex items-center gap-2 text-xs">
        {hasAiValue && (
          <span className="text-blue-600 dark:text-blue-400">
            AI: {aiValue}
          </span>
        )}
        {hasCurrentValue && hasAiValue && currentValue !== aiValue && (
          <>
            <span className="text-gray-400">•</span>
            <span className="text-gray-500 dark:text-gray-400">
              Current: {currentValue}
            </span>
          </>
        )}
      </div>
    </div>
  );
};

const LinkDisplay = ({ label, url, isDark }) => (
  <div className="flex items-center justify-between">
    <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
    >
      <ExternalLink className="h-3 w-3" />
      Open
    </a>
  </div>
);

GlobalPartAIReviewModal.propTypes = {
  part: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
    part_number: PropTypes.string,
    manufacturer: PropTypes.string,
    model: PropTypes.string,
    power_watts: PropTypes.number,
    total_ports: PropTypes.number,
    poe_ports: PropTypes.number,
    poe_port_list: PropTypes.string,
    ups_battery_outlets: PropTypes.number,
    ups_surge_only_outlets: PropTypes.number,
    ai_enrichment_data: PropTypes.object,
    ai_enrichment_notes: PropTypes.string,
    ai_enrichment_confidence: PropTypes.number,
    ai_enrichment_status: PropTypes.string,
  }).isRequired,
  onSave: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};

FieldSection.propTypes = {
  icon: PropTypes.node.isRequired,
  title: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
  isDark: PropTypes.bool,
};

EditableField.propTypes = {
  label: PropTypes.string.isRequired,
  aiValue: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  currentValue: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  editedValue: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onChange: PropTypes.func.isRequired,
  type: PropTypes.string,
  placeholder: PropTypes.string,
  isDark: PropTypes.bool,
};

LinkDisplay.propTypes = {
  label: PropTypes.string.isRequired,
  url: PropTypes.string.isRequired,
  isDark: PropTypes.bool,
};

export default GlobalPartAIReviewModal;
