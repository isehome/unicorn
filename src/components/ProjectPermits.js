import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { permitService } from '../services/permitService';
import { milestoneService } from '../services/milestoneService';
import PermitForm from './PermitForm';
import Button from './ui/Button';
import Modal from './ui/Modal';
import DateInput from './ui/DateInput';
import DateField from './ui/DateField';
import {
  Plus,
  Edit,
  Trash2,
  FileText,
  Download,
  Circle,
  AlertCircle
} from 'lucide-react';

/**
 * ProjectPermits Component
 * Displays and manages project permits with inspection tracking
 * Auto-populates inspection target dates from project milestones
 * Auto-updates milestone actual dates when inspections are completed
 */
function ProjectPermits({ projectId, onMilestoneChange }) {
  const { user } = useAuth();
  const [permits, setPermits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingPermit, setEditingPermit] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [permitToDelete, setPermitToDelete] = useState(null);
  const [inspectionDateDialogs, setInspectionDateDialogs] = useState({
    roughIn: { open: false, permitId: null, date: '' },
    final: { open: false, permitId: null, date: '' }
  });

  useEffect(() => {
    if (projectId) {
      loadPermitsAndMilestones();
    }
  }, [projectId]);

  const loadPermitsAndMilestones = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load permits and milestones in parallel
      const [permitsData, milestonesData] = await Promise.all([
        permitService.getProjectPermits(projectId),
        milestoneService.getProjectMilestones(projectId)
      ]);

      setPermits(permitsData);

      // Auto-populate permit target dates from milestones if not set
      await autoPopulateTargetDates(permitsData, milestonesData);
    } catch (err) {
      console.error('Error loading permits and milestones:', err);
      setError('Failed to load permits. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadPermits = async () => {
    // Keep this method for compatibility with existing handlers
    await loadPermitsAndMilestones();
  };

  /**
   * Auto-populate permit target dates from milestone target dates
   * - Rough-in target from prewire milestone target
   * - Final inspection target from trim milestone target
   */
  const autoPopulateTargetDates = async (permitsData, milestonesData) => {
    try {
      const prewireMilestone = milestonesData.find(m => m.milestone_type === 'prewire');
      const trimMilestone = milestonesData.find(m => m.milestone_type === 'trim');

      const updates = [];

      for (const permit of permitsData) {
        // Auto-populate rough-in target date from prewire milestone
        if (!permit.rough_in_target_date && prewireMilestone?.target_date) {
          updates.push(
            permitService.updateRoughInTargetDate(permit.id, prewireMilestone.target_date)
          );
        }

        // Auto-populate final inspection target date from trim milestone
        if (!permit.final_inspection_target_date && trimMilestone?.target_date) {
          updates.push(
            permitService.updateFinalInspectionTargetDate(permit.id, trimMilestone.target_date)
          );
        }
      }

      // Execute all updates if any
      if (updates.length > 0) {
        await Promise.all(updates);
        // Reload permits to show updated dates
        const freshPermits = await permitService.getProjectPermits(projectId);
        setPermits(freshPermits);
      }
    } catch (err) {
      console.error('Error auto-populating target dates:', err);
      // Don't throw - this is a best-effort enhancement
    }
  };

  const handleAddPermit = () => {
    setEditingPermit(null);
    setFormOpen(true);
  };

  const handleEditPermit = (permit) => {
    setEditingPermit(permit);
    setFormOpen(true);
  };

  const handleCloseForm = () => {
    setFormOpen(false);
    setEditingPermit(null);
  };

  const handleFormSubmit = async () => {
    await loadPermits();
    handleCloseForm();
  };

  const handleDeleteClick = (permit) => {
    setPermitToDelete(permit);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      await permitService.deletePermit(permitToDelete.id);
      await loadPermits();
      setDeleteDialogOpen(false);
      setPermitToDelete(null);
    } catch (err) {
      console.error('Error deleting permit:', err);
      setError('Failed to delete permit. Please try again.');
    }
  };

  const handleRoughInTargetDateChange = async (permitId, targetDate) => {
    try {
      await permitService.updateRoughInTargetDate(permitId, targetDate || null);
      await loadPermits();
    } catch (err) {
      console.error('Error updating rough-in target date:', err);
      setError('Failed to update rough-in target date. Please try again.');
    }
  };

  const handleFinalInspectionTargetDateChange = async (permitId, targetDate) => {
    try {
      await permitService.updateFinalInspectionTargetDate(permitId, targetDate || null);
      await loadPermits();
    } catch (err) {
      console.error('Error updating final inspection target date:', err);
      setError('Failed to update final inspection target date. Please try again.');
    }
  };

  const handleRoughInToggle = async (permit) => {
    if (permit.rough_in_completed) {
      // Uncheck - remove completion (also clears prewire milestone)
      try {
        await permitService.uncompleteRoughInInspection(permit.id, projectId, {
          id: user?.id,
          name: user?.displayName,
          email: user?.email
        });
        await loadPermits();

        // Notify parent to reload milestones
        if (onMilestoneChange) {
          onMilestoneChange();
        }
      } catch (err) {
        console.error('Error updating rough-in inspection:', err);
        setError('Failed to update rough-in inspection. Please try again.');
      }
    } else {
      // Check - open date dialog
      setInspectionDateDialogs({
        ...inspectionDateDialogs,
        roughIn: {
          open: true,
          permitId: permit.id,
          date: permit.rough_in_date || formatDateForInput(new Date())
        }
      });
    }
  };

  const handleFinalInspectionToggle = async (permit) => {
    if (permit.final_inspection_completed) {
      // Uncheck - remove completion (also clears trim milestone)
      try {
        await permitService.uncompleteFinalInspection(permit.id, projectId, {
          id: user?.id,
          name: user?.displayName,
          email: user?.email
        });
        await loadPermits();

        // Notify parent to reload milestones
        if (onMilestoneChange) {
          onMilestoneChange();
        }
      } catch (err) {
        console.error('Error updating final inspection:', err);
        setError('Failed to update final inspection. Please try again.');
      }
    } else {
      // Check - open date dialog
      setInspectionDateDialogs({
        ...inspectionDateDialogs,
        final: {
          open: true,
          permitId: permit.id,
          date: permit.final_inspection_date || formatDateForInput(new Date())
        }
      });
    }
  };

  const handleRoughInDateConfirm = async () => {
    try {
      const { permitId, date } = inspectionDateDialogs.roughIn;
      // Complete inspection and auto-update prewire milestone
      await permitService.completeRoughInInspection(permitId, date, projectId, {
        id: user?.id,
        name: user?.displayName,
        email: user?.email
      });
      await loadPermits();

      // Notify parent to reload milestones
      if (onMilestoneChange) {
        onMilestoneChange();
      }

      setInspectionDateDialogs({
        ...inspectionDateDialogs,
        roughIn: { open: false, permitId: null, date: '' }
      });
    } catch (err) {
      console.error('Error completing rough-in inspection:', err);
      setError('Failed to complete rough-in inspection. Please try again.');
    }
  };

  const handleFinalInspectionDateConfirm = async () => {
    try {
      const { permitId, date } = inspectionDateDialogs.final;
      // Complete inspection and auto-update trim milestone
      await permitService.completeFinalInspection(permitId, date, projectId, {
        id: user?.id,
        name: user?.displayName,
        email: user?.email
      });
      await loadPermits();

      // Notify parent to reload milestones
      if (onMilestoneChange) {
        onMilestoneChange();
      }

      setInspectionDateDialogs({
        ...inspectionDateDialogs,
        final: { open: false, permitId: null, date: '' }
      });
    } catch (err) {
      console.error('Error completing final inspection:', err);
      setError('Failed to complete final inspection. Please try again.');
    }
  };

  const handleDownloadPermit = async (permit) => {
    try {
      const signedUrl = await permitService.getSignedUrl(permit.permit_document_url);
      window.open(signedUrl, '_blank');
    } catch (err) {
      console.error('Error downloading permit:', err);
      setError('Failed to download permit. Please try again.');
    }
  };

  const formatDateForInput = (date) => {
    if (!date) return '';
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatUserInfo = (name, email, timestamp) => {
    if (!name && !email) return 'N/A';
    const displayName = name || email || 'Unknown User';
    const dateStr = timestamp ? ` on ${formatDateTime(timestamp)}` : '';
    return `${displayName}${dateStr}`;
  };

  if (loading) {
    return (
      <div className="p-6 bg-gray-50 dark:bg-zinc-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
        <p className="text-sm text-gray-600 dark:text-gray-400">Loading permits...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Project Permits</h3>
        <Button
          variant="primary"
          size="sm"
          icon={Plus}
          onClick={handleAddPermit}
        >
          Add Permit
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200"
          >
            <Circle className="w-4 h-4" />
          </button>
        </div>
      )}

      {permits.length === 0 ? (
        <div className="p-6 bg-gray-50 dark:bg-zinc-900/50 rounded-lg border border-gray-200 dark:border-gray-700 text-center">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-sm text-gray-600 dark:text-gray-400">
            No permits added yet. Click "Add Permit" to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {permits.map((permit) => (
            <div
              key={permit.id}
              className="p-4 bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <h4 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
                    Permit #{permit.permit_number}
                  </h4>

                  {permit.permit_document_url && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-2">
                      <FileText className="w-4 h-4 text-red-500" />
                      <span>{permit.permit_document_name || 'Permit Document'}</span>
                      <button
                        onClick={() => handleDownloadPermit(permit)}
                        className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </button>
                    </div>
                  )}

                  {permit.notes && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                      {permit.notes}
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleEditPermit(permit)}
                    className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                    title="Edit Permit"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteClick(permit)}
                    className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                    title="Delete Permit"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Inspections */}
              <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-3">
                {/* Rough-In Inspection */}
                <div className="space-y-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    Rough-In Inspection
                  </span>

                  {/* Target Date */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300 w-20">
                      Target Date:
                    </label>
                    <div className="flex-1">
                      <DateInput
                        value={permit.rough_in_target_date || ''}
                        onChange={(e) => handleRoughInTargetDateChange(permit.id, e.target.value)}
                        className="text-xs"
                      />
                    </div>
                  </div>

                  {/* Completion Checkbox */}
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={permit.rough_in_completed}
                      onChange={() => handleRoughInToggle(permit)}
                      className="mt-1 w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    <div className="flex-1">
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        Inspection Complete
                      </span>
                      {permit.rough_in_completed && (
                        <div className="mt-1 text-xs space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-600 dark:text-gray-400">Date:</span>
                            <DateField
                              date={permit.rough_in_date}
                              isCompleted={true}
                              variant="inline"
                              showIcon={false}
                            />
                          </div>
                          <div className="text-gray-600 dark:text-gray-400">
                            Completed by: {formatUserInfo(permit.rough_in_completed_by_name, permit.rough_in_completed_by_email, permit.rough_in_completed_at)}
                          </div>
                        </div>
                      )}
                    </div>
                  </label>
                </div>

                {/* Final Inspection */}
                <div className="space-y-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    Final Inspection
                  </span>

                  {/* Target Date */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300 w-20">
                      Target Date:
                    </label>
                    <div className="flex-1">
                      <DateInput
                        value={permit.final_inspection_target_date || ''}
                        onChange={(e) => handleFinalInspectionTargetDateChange(permit.id, e.target.value)}
                        className="text-xs"
                      />
                    </div>
                  </div>

                  {/* Completion Checkbox */}
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={permit.final_inspection_completed}
                      onChange={() => handleFinalInspectionToggle(permit)}
                      className="mt-1 w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    <div className="flex-1">
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        Inspection Complete
                      </span>
                      {permit.final_inspection_completed && (
                        <div className="mt-1 text-xs space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-600 dark:text-gray-400">Date:</span>
                            <DateField
                              date={permit.final_inspection_date}
                              isCompleted={true}
                              variant="inline"
                              showIcon={false}
                            />
                          </div>
                          <div className="text-gray-600 dark:text-gray-400">
                            Completed by: {formatUserInfo(permit.final_inspection_completed_by_name, permit.final_inspection_completed_by_email, permit.final_inspection_completed_at)}
                          </div>
                        </div>
                      )}
                    </div>
                  </label>
                </div>
              </div>

              {/* Audit Trail */}
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                <div>Created by: {formatUserInfo(permit.created_by_name, permit.created_by_email, permit.created_at)}</div>
                {permit.updated_at !== permit.created_at && (
                  <div>Last updated by: {formatUserInfo(permit.updated_by_name, permit.updated_by_email, permit.updated_at)}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Permit Modal */}
      <Modal
        isOpen={formOpen}
        onClose={handleCloseForm}
        title={editingPermit ? 'Edit Permit' : 'Add Permit'}
        size="md"
      >
        <PermitForm
          projectId={projectId}
          permit={editingPermit}
          onSubmit={handleFormSubmit}
          onCancel={handleCloseForm}
        />
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        title="Delete Permit"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-700 dark:text-gray-300">
            Are you sure you want to delete permit #{permitToDelete?.permit_number}? This action cannot be undone.
          </p>
          <div className="flex gap-3 justify-end">
            <Button
              variant="secondary"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteConfirm}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Rough-In Date Dialog */}
      <Modal
        isOpen={inspectionDateDialogs.roughIn.open}
        onClose={() => setInspectionDateDialogs({
          ...inspectionDateDialogs,
          roughIn: { open: false, permitId: null, date: '' }
        })}
        title="Rough-In Inspection Date"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Inspection Date
            </label>
            <DateInput
              value={inspectionDateDialogs.roughIn.date}
              onChange={(e) => setInspectionDateDialogs({
                ...inspectionDateDialogs,
                roughIn: { ...inspectionDateDialogs.roughIn, date: e.target.value }
              })}
            />
          </div>
          <div className="flex gap-3 justify-end">
            <Button
              variant="secondary"
              onClick={() => setInspectionDateDialogs({
                ...inspectionDateDialogs,
                roughIn: { open: false, permitId: null, date: '' }
              })}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleRoughInDateConfirm}
            >
              Confirm
            </Button>
          </div>
        </div>
      </Modal>

      {/* Final Inspection Date Dialog */}
      <Modal
        isOpen={inspectionDateDialogs.final.open}
        onClose={() => setInspectionDateDialogs({
          ...inspectionDateDialogs,
          final: { open: false, permitId: null, date: '' }
        })}
        title="Final Inspection Date"
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Inspection Date
            </label>
            <DateInput
              value={inspectionDateDialogs.final.date}
              onChange={(e) => setInspectionDateDialogs({
                ...inspectionDateDialogs,
                final: { ...inspectionDateDialogs.final, date: e.target.value }
              })}
            />
          </div>
          <div className="flex gap-3 justify-end">
            <Button
              variant="secondary"
              onClick={() => setInspectionDateDialogs({
                ...inspectionDateDialogs,
                final: { open: false, permitId: null, date: '' }
              })}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleFinalInspectionDateConfirm}
            >
              Confirm
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default ProjectPermits;
