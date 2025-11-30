// src/components/IssueAssignments.js
import React, { useState, useEffect } from 'react';
import { User, Plus, X } from 'lucide-react';
import { getProjectTeam, getIssueAssignments, assignContactToIssue } from '../lib/supabase';
import Button from './ui/Button';
import { stakeholderColors } from '../styles/styleSystem';

const IssueAssignments = ({ issueId, projectId }) => {
  const [projectTeam, setProjectTeam] = useState([]);
  const [issueAssignments, setIssueAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    loadData();
  }, [issueId, projectId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [team, assignments] = await Promise.all([
        getProjectTeam(projectId),
        getIssueAssignments(issueId)
      ]);
      setProjectTeam(team);
      setIssueAssignments(assignments);
    } catch (error) {
      console.error('Error loading issue assignments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignToIssue = async (contactId, type = 'watcher') => {
    try {
      await assignContactToIssue(issueId, contactId, type);
      setShowAddModal(false);
      await loadData();
    } catch (error) {
      console.error('Error assigning to issue:', error);
    }
  };

  // Filter out team members already assigned to this issue
  const availableTeamMembers = projectTeam.filter(teamMember => 
    !issueAssignments.some(assignment => assignment.contact_id === teamMember.contact_id)
  );

  if (loading) return <div className="text-gray-900 dark:text-white">Loading assignments...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Issue Assignments</h3>
        {availableTeamMembers.length > 0 && (
          <Button
            onClick={() => setShowAddModal(true)}
            size="sm"
            variant="outline"
          >
            <Plus className="w-4 h-4 mr-1" />
            Assign
          </Button>
        )}
      </div>
      
      {/* Show current assignments */}
      <div className="space-y-2">
        {issueAssignments.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm italic">No one assigned to this issue</p>
        ) : (
          issueAssignments.map(assignment => (
            <div key={assignment.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
              <div className="flex items-center space-x-2">
                <User className="w-4 h-4 text-gray-400" />
                <span className="text-gray-900 dark:text-white">
                  {assignment.contact.first_name} {assignment.contact.last_name}
                </span>
                <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                  {assignment.assignment_type}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Assignment Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">Assign Team Member</h3>
              <Button
                onClick={() => setShowAddModal(false)}
                size="sm"
                variant="ghost"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {availableTeamMembers.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-sm">All project team members are already assigned</p>
              ) : (
                availableTeamMembers.map(teamMember => (
                  <div key={teamMember.id} className="space-y-1">
                    <button
                      onClick={() => handleAssignToIssue(teamMember.contact_id, 'assignee')}
                      className="block w-full text-left p-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
                      style={{ borderLeft: `3px solid ${teamMember.contact?.is_internal ? stakeholderColors.internal.border : stakeholderColors.external.border}` }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: teamMember.contact?.is_internal ? stakeholderColors.internal.text : stakeholderColors.external.text }}
                        />
                        <span className="font-medium text-gray-900 dark:text-white">
                          {teamMember.contact.first_name} {teamMember.contact.last_name}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 ml-4">
                        {teamMember.stakeholder_slot?.slot_name} • Assign as Assignee
                      </div>
                    </button>
                    <button
                      onClick={() => handleAssignToIssue(teamMember.contact_id, 'watcher')}
                      className="block w-full text-left p-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
                      style={{ borderLeft: `3px solid ${teamMember.contact?.is_internal ? stakeholderColors.internal.border : stakeholderColors.external.border}` }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: teamMember.contact?.is_internal ? stakeholderColors.internal.text : stakeholderColors.external.text }}
                        />
                        <span className="font-medium text-gray-900 dark:text-white">
                          {teamMember.contact.first_name} {teamMember.contact.last_name}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 ml-4">
                        {teamMember.stakeholder_slot?.slot_name} • Assign as Watcher
                      </div>
                    </button>
                  </div>
                ))
              )}
            </div>
            
            <div className="mt-4 flex justify-end">
              <Button
                onClick={() => setShowAddModal(false)}
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
};

export default IssueAssignments;