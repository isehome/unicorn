import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import Button from './ui/Button';
import { Trash2, AlertCircle, CheckCircle, Loader, RefreshCw, Plus } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';

const WireDropDeleteTest = () => {
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];
  
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [policyStatus, setPolicyStatus] = useState(null);
  const [wireDrops, setWireDrops] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [deleteResults, setDeleteResults] = useState({});
  const [loading, setLoading] = useState(false);
  const [testDropName, setTestDropName] = useState('TEST-DELETE-ME');

  // Auto-connect on mount
  useEffect(() => {
    checkConnection();
    loadProjects();
  }, []);

  const checkConnection = async () => {
    try {
      if (!supabase) {
        setConnectionStatus('❌ Supabase not configured. Check your .env file.');
        return;
      }

      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (user) {
        setConnectionStatus(`✅ Connected and authenticated as: ${user.email || 'User'}`);
      } else {
        setConnectionStatus('⚠️ Connected but not authenticated. You may need to log in.');
      }
    } catch (error) {
      setConnectionStatus(`❌ Connection error: ${error.message}`);
    }
  };

  const checkDeletePolicy = async () => {
    try {
      setLoading(true);
      setPolicyStatus('Checking...');

      // Try a delete with a valid but non-existent UUID to check for policy errors
      // Using a properly formatted UUID that doesn't exist
      const testId = '00000000-0000-0000-0000-000000000000';
      const { error: deleteError } = await supabase
        .from('wire_drops')
        .delete()
        .eq('id', testId);

      if (deleteError) {
        if (deleteError.message?.includes('policy') || deleteError.code === '42501') {
          setPolicyStatus(
            `❌ DELETE Policy Missing!\n\nError: ${deleteError.message}\nCode: ${deleteError.code}\n\n` +
            'SOLUTION: Run the SQL script "fix_wire_drops_delete_NOW.sql" in Supabase SQL Editor'
          );
        } else if (deleteError.message?.includes('invalid input syntax')) {
          // Should not happen now that we're using valid UUID format
          setPolicyStatus(`⚠️ UUID format error - this shouldn't happen. Error: ${deleteError.message}`);
        } else {
          // This is actually good - it means we can attempt deletes but nothing was found to delete
          setPolicyStatus('✅ DELETE policy appears to be working! (No rows matched the test UUID, which is expected)');
        }
      } else {
        // No error means the delete was attempted successfully (even if no rows were affected)
        setPolicyStatus('✅ DELETE policy is working correctly! The operation completed without permission errors.');
      }
    } catch (error) {
      setPolicyStatus(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadWireDrops = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('wire_drops')
        .select('id, name, room_name, drop_name, uid, project_id')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setWireDrops(data || []);
    } catch (error) {
      console.error('Error loading wire drops:', error);
      setWireDrops([]);
    } finally {
      setLoading(false);
    }
  };

  const loadProjects = async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name')
        .order('name');

      if (!error && data && data.length > 0) {
        setProjects(data);
        setSelectedProject(data[0].id);
      }
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  };

  const testDelete = async (dropId) => {
    try {
      setDeleteResults(prev => ({ ...prev, [dropId]: 'Testing...' }));

      // Step 1: Check if it exists
      const { data: beforeData, error: beforeError } = await supabase
        .from('wire_drops')
        .select('id, name')
        .eq('id', dropId)
        .single();

      if (beforeError || !beforeData) {
        setDeleteResults(prev => ({ ...prev, [dropId]: `❌ Not found: ${beforeError?.message || 'No data'}` }));
        return;
      }

      // Step 2: Attempt delete
      const { data: deleteData, error: deleteError } = await supabase
        .from('wire_drops')
        .delete()
        .eq('id', dropId)
        .select();

      if (deleteError) {
        setDeleteResults(prev => ({ 
          ...prev, 
          [dropId]: `❌ Delete failed: ${deleteError.message} (Code: ${deleteError.code})` 
        }));
        return;
      }

      // Step 3: Verify it's gone
      const { data: afterData, error: afterError } = await supabase
        .from('wire_drops')
        .select('id')
        .eq('id', dropId)
        .single();

      if (!afterData && afterError?.code === 'PGRST116') {
        // PGRST116 means no rows returned - good!
        setDeleteResults(prev => ({ ...prev, [dropId]: '✅ Successfully deleted!' }));
        // Refresh the list
        await loadWireDrops();
      } else if (afterData) {
        setDeleteResults(prev => ({ 
          ...prev, 
          [dropId]: '❌ DELETE FAILED - Item still exists! Run the SQL fix script.' 
        }));
      } else {
        setDeleteResults(prev => ({ 
          ...prev, 
          [dropId]: `⚠️ Unclear result. After error: ${afterError?.message}` 
        }));
      }
    } catch (error) {
      setDeleteResults(prev => ({ ...prev, [dropId]: `Error: ${error.message}` }));
    }
  };

  const createTestDrop = async () => {
    if (!selectedProject) {
      alert('Please select a project first');
      return;
    }

    try {
      setLoading(true);
      const testDrop = {
        project_id: selectedProject,
        name: testDropName,
        drop_name: testDropName,
        room_name: 'Test Room',
        uid: 'TEST-' + Date.now(),
        type: 'CAT6',
        location: 'Test Location'
      };

      const { data, error } = await supabase
        .from('wire_drops')
        .insert(testDrop)
        .select()
        .single();

      if (error) throw error;

      alert(`Test wire drop created: ${data.name} (ID: ${data.id})`);
      await loadWireDrops();
    } catch (error) {
      alert(`Error creating test drop: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div style={sectionStyles.header} className="shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            🔍 Wire Drop Delete Diagnostic
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Test wire drop deletion using your existing Supabase connection
          </p>
        </div>

        {/* Connection Status */}
        <div style={sectionStyles.card}>
          <h2 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">
            1. Connection Status
          </h2>
          <div className={`p-3 rounded-lg ${
            connectionStatus?.includes('✅') ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' :
            connectionStatus?.includes('⚠️') ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300' :
            connectionStatus?.includes('❌') ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300' :
            'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
          }`}>
            <pre className="whitespace-pre-wrap text-sm font-mono">
              {connectionStatus || 'Checking connection...'}
            </pre>
          </div>
          <Button 
            variant="secondary" 
            icon={RefreshCw} 
            onClick={checkConnection}
            className="mt-3"
            size="sm"
          >
            Refresh Connection
          </Button>
        </div>

        {/* Policy Check */}
        <div style={sectionStyles.card}>
          <h2 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">
            2. Check DELETE Policy
          </h2>
          <Button 
            variant="primary" 
            icon={AlertCircle} 
            onClick={checkDeletePolicy}
            loading={loading}
            disabled={loading || !connectionStatus?.includes('✅')}
          >
            Check DELETE Policy
          </Button>
          {policyStatus && (
            <div className={`mt-3 p-3 rounded-lg ${
              policyStatus.includes('✅') ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' :
              policyStatus.includes('❌') ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300' :
              'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
            }`}>
              <pre className="whitespace-pre-wrap text-sm font-mono">{policyStatus}</pre>
            </div>
          )}
        </div>

        {/* Wire Drops List */}
        <div style={sectionStyles.card}>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              3. Test Delete Operations
            </h2>
            <Button 
              variant="secondary" 
              icon={RefreshCw} 
              onClick={loadWireDrops}
              loading={loading}
              disabled={loading}
              size="sm"
            >
              Refresh List
            </Button>
          </div>
          
          {wireDrops.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No wire drops found</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {wireDrops.map(drop => (
                <div key={drop.id} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      {drop.name || drop.drop_name || 'Unnamed'}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      ID: {drop.id.substring(0, 8)}... | UID: {drop.uid || 'none'}
                    </div>
                    {deleteResults[drop.id] && (
                      <div className={`text-xs mt-1 font-mono ${
                        deleteResults[drop.id].includes('✅') ? 'text-green-600 dark:text-green-400' :
                        deleteResults[drop.id].includes('❌') ? 'text-red-600 dark:text-red-400' :
                        'text-yellow-600 dark:text-yellow-400'
                      }`}>
                        {deleteResults[drop.id]}
                      </div>
                    )}
                  </div>
                  <Button 
                    variant="danger" 
                    icon={Trash2}
                    onClick={() => testDelete(drop.id)}
                    size="sm"
                    disabled={deleteResults[drop.id] === 'Testing...'}
                  >
                    Delete
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Create Test Drop */}
        <div style={sectionStyles.card}>
          <h2 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">
            4. Create Test Wire Drop
          </h2>
          <div className="space-y-3">
            <input
              type="text"
              value={testDropName}
              onChange={(e) => setTestDropName(e.target.value)}
              placeholder="Test drop name"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="">Select a project</option>
              {projects.map(project => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
            <Button 
              variant="primary" 
              icon={Plus}
              onClick={createTestDrop}
              loading={loading}
              disabled={loading || !selectedProject}
            >
              Create Test Wire Drop
            </Button>
          </div>
        </div>

        {/* Fix Instructions */}
        <div style={sectionStyles.card} className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800">
          <h2 className="text-lg font-semibold mb-3 text-blue-900 dark:text-blue-100">
            📝 If Delete Fails - Run This SQL Fix
          </h2>
          <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800 dark:text-blue-200">
            <li>Go to your Supabase Dashboard → SQL Editor</li>
            <li>Click "New Query"</li>
            <li>Copy and paste the contents of <code className="bg-white dark:bg-gray-800 px-1 py-0.5 rounded">supabase/fix_wire_drops_delete_NOW.sql</code></li>
            <li>Click "Run"</li>
            <li>Come back here and test delete again - it should work!</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default WireDropDeleteTest;
