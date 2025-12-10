// src/components/StakeholderSlotManager.js
import React, { useState, useEffect } from 'react';
import { Plus, User, Trash2 } from 'lucide-react';
import {
  getStakeholderSlots,
  getProjectTeam,
  getAvailableContactsForProject,
  assignContactToProject,
  removeProjectAssignment
} from '../lib/supabase';
import Button from './ui/Button';
import { stakeholderColors } from '../styles/styleSystem';

const StakeholderSlotManager = ({ projectId, theme }) => {
  const [stakeholderSlots, setStakeholderSlots] = useState([]);
  const [projectTeam, setProjectTeam] = useState([]);
  const [availableContacts, setAvailableContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showContactPicker, setShowContactPicker] = useState(null); // slot ID

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [slots, team, available] = await Promise.all([
        getStakeholderSlots(),
        getProjectTeam(projectId),
        getAvailableContactsForProject(projectId)
      ]);
      
      setStakeholderSlots(slots);
      setProjectTeam(team);
      setAvailableContacts(available);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignContact = async (contactId, slotId) => {
    try {
      await assignContactToProject({
        project_id: projectId,
        contact_id: contactId,
        stakeholder_slot_id: slotId,
        assignment_status: 'active'
      });
      
      setShowContactPicker(null);
      await loadData(); // Refresh data
    } catch (error) {
      console.error('Error assigning contact:', error);
    }
  };

  const handleRemoveAssignment = async (assignmentId) => {
    try {
      await removeProjectAssignment(assignmentId);
      await loadData(); // Refresh data
    } catch (error) {
      console.error('Error removing assignment:', error);
    }
  };

  const getAssignmentsForSlot = (slotId) => {
    return projectTeam.filter(assignment => assignment.stakeholder_slot_id === slotId);
  };

  if (loading) return <div className="text-gray-900 dark:text-white">Loading...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Project Team</h2>
      
      {stakeholderSlots.map(slot => {
        const assignments = getAssignmentsForSlot(slot.id);
        const canAddMore = assignments.length < slot.max_assignees;
        
        return (
          <div key={slot.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-zinc-800">
            <div className="flex justify-between items-center mb-3">
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white">{slot.slot_name}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {slot.slot_type} • {assignments.length}/{slot.max_assignees} assigned
                  {slot.is_required && <span className="text-red-500 ml-1">*</span>}
                </p>
              </div>
              
              {canAddMore && (
                <Button
                  onClick={() => setShowContactPicker(slot.id)}
                  size="sm"
                  variant="outline"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Person
                </Button>
              )}
            </div>

            <div className="space-y-2">
              {assignments.map(assignment => (
                <div key={assignment.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 p-2 rounded">
                  <div className="flex items-center space-x-2">
                    <User className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    <span className="text-gray-900 dark:text-white">{assignment.contact.first_name} {assignment.contact.last_name}</span>
                    {assignment.is_primary && (
                      <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs px-2 py-1 rounded">Primary</span>
                    )}
                  </div>
                  <Button
                    onClick={() => handleRemoveAssignment(assignment.id)}
                    size="sm"
                    variant="ghost"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Contact Picker Modal */}
            {showContactPicker === slot.id && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white dark:bg-zinc-800 p-6 rounded-lg max-w-md w-full max-h-96 overflow-y-auto">
                  <h3 className="text-lg font-medium mb-4 text-gray-900 dark:text-white">Assign to {slot.slot_name}</h3>
                  
                  <div className="space-y-2">
                    {availableContacts.map(contact => (
                      <div
                        key={contact.id}
                        className="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer"
                        style={{ borderLeft: `3px solid ${contact.is_internal ? stakeholderColors.internal.border : stakeholderColors.external.border}` }}
                        onClick={() => handleAssignContact(contact.id, slot.id)}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: contact.is_internal ? stakeholderColors.internal.text : stakeholderColors.external.text }}
                          />
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">
                              {contact.first_name} {contact.last_name}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">{contact.email}</div>
                          </div>
                        </div>
                        <span
                          className="px-2 py-0.5 text-xs rounded-full"
                          style={{
                            backgroundColor: contact.is_internal ? stakeholderColors.internal.bg : stakeholderColors.external.bg,
                            color: contact.is_internal ? stakeholderColors.internal.text : stakeholderColors.external.text
                          }}
                        >
                          {contact.is_internal ? 'Internal' : 'External'}
                        </span>
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-4 flex justify-end">
                    <Button
                      onClick={() => setShowContactPicker(null)}
                      variant="outline"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default StakeholderSlotManager;