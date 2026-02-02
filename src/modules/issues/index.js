import React, { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Button from '../../components/ui/Button';

const IssuesModule = ({ projectId }) => {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    if (projectId) {
      fetchIssues();
    }
  }, [projectId]);

  const fetchIssues = async () => {
    try {
      setLoading(true);
      const { data: issuesData, error: issuesError } = await supabase
        .from('issues')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (!issuesError) setIssues(issuesData || []);
    } catch (err) {
      console.error('Error fetching issues:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddIssue = async () => {
    const title = prompt('Issue title:');
    if (!title) return;

    try {
      const { error } = await supabase
        .from('issues')
        .insert({
          project_id: projectId,
          title: title,
          status: 'open',
          notes: '',
          date: new Date().toISOString().split('T')[0]
        });

      if (error) throw error;
      fetchIssues();
    } catch (err) {
      console.error('Error adding issue:', err);
      alert('Failed to add issue');
    }
  };

  const handleUpdateIssue = async (e) => {
    e.preventDefault();
    const { error } = await supabase
      .from('issues')
      .update({
        title: selectedIssue.title,
        notes: selectedIssue.notes,
        status: selectedIssue.status
      })
      .eq('id', selectedIssue.id);
    
    if (!error) {
      fetchIssues();
      setEditMode(false);
    }
  };

  const handleResolveIssue = async (issue) => {
    try {
      const { error } = await supabase
        .from('issues')
        .update({ status: 'resolved' })
        .eq('id', issue.id);

      if (error) throw error;
      fetchIssues();
      setEditMode(false);
    } catch (err) {
      console.error('Error resolving issue:', err);
    }
  };

  const filteredIssues = showResolved 
    ? issues 
    : issues.filter(issue => issue.status !== 'resolved');

  if (loading) {
    return <div className="flex items-center justify-center p-8">Loading issues...</div>;
  }

  return (
    <div className="bg-white dark:bg-zinc-800 rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Issues ({filteredIssues.length})
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowResolved(!showResolved)}
            className={`px-3 py-1 rounded-lg text-sm ${
              showResolved 
                ? 'bg-gray-200 dark:bg-gray-700' 
                : 'bg-violet-100 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300'
            }`}
          >
            {showResolved ? 'Hide' : 'Show'} Resolved
          </button>
          <Button variant="primary" size="sm" icon={Plus} onClick={handleAddIssue}>
            Add Issue
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {filteredIssues.map((issue) => (
          <div 
            key={issue.id}
            onClick={() => {
              setSelectedIssue(issue);
              setEditMode(true);
            }}
            className={`border rounded-lg p-4 transition-all cursor-pointer ${
              issue.status === 'resolved'
                ? 'border-gray-200 dark:border-gray-700 opacity-60' 
                : issue.status === 'blocked'
                ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
                : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20'
            }`}
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  {issue.title}
                </h3>
                {issue.notes && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {issue.notes}
                  </p>
                )}
                <div className="flex gap-2 mt-2">
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-medium ${
                      issue.status === 'blocked'
                        ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                        : issue.status !== 'resolved'
                        ? 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                        : ''
                    }`}
                    style={issue.status === 'resolved' ? { backgroundColor: 'rgba(148, 175, 50, 0.1)', color: '#94AF32' } : undefined}
                  >
                    {issue.status}
                  </span>
                </div>
              </div>
              {issue.status !== 'resolved' && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleResolveIssue(issue);
                  }}
                >
                  Mark Resolved
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Issue Edit Modal */}
      {editMode && selectedIssue && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-zinc-800 rounded-lg p-6 max-w-xl w-full">
            <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Edit Issue</h3>
            <form onSubmit={handleUpdateIssue}>
              <div className="space-y-4">
                <input
                  type="text"
                  value={selectedIssue.title}
                  onChange={(e) => setSelectedIssue({...selectedIssue, title: e.target.value})}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded"
                  placeholder="Issue Title"
                />
                <textarea
                  value={selectedIssue.notes || ''}
                  onChange={(e) => setSelectedIssue({...selectedIssue, notes: e.target.value})}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded"
                  rows="4"
                  placeholder="Notes"
                />
                <select
                  value={selectedIssue.status}
                  onChange={(e) => setSelectedIssue({...selectedIssue, status: e.target.value})}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded"
                >
                  <option value="open">Open</option>
                  <option value="blocked">Blocked</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
              <div className="flex gap-2 mt-4">
                <button type="submit" className="px-4 py-2 bg-blue-500 text-white rounded">
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => handleResolveIssue(selectedIssue)}
                  className="px-4 py-2 text-white rounded"
                  style={{ backgroundColor: '#94AF32' }}
                >
                  Mark Resolved
                </button>
                <button type="button" onClick={() => setEditMode(false)} 
                  className="px-4 py-2 bg-gray-500 text-white rounded">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default IssuesModule;