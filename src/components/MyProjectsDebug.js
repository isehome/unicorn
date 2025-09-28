import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { projectStakeholdersService, projectsService } from '../services/supabaseService';
import { supabase } from '../lib/supabase';

const MyProjectsDebug = () => {
  const { user } = useAuth();
  const [debugInfo, setDebugInfo] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const runDiagnostics = async () => {
      const info = {
        userEmail: user?.email || 'No email',
        userId: user?.id || 'No ID',
        timestamp: new Date().toISOString()
      };

      try {
        // Test 1: Get all projects
        const allProjects = await projectsService.getAll();
        info.allProjectsCount = allProjects.length;
        info.allProjects = allProjects.slice(0, 3).map(p => ({ id: p.id, name: p.name }));

        // Test 2: Get my project IDs
        if (user?.email) {
          const myProjectIds = await projectStakeholdersService.getInternalProjectIdsByEmail(user.email);
          info.myProjectIds = myProjectIds;
          info.myProjectsCount = myProjectIds.length;
        }

        // Test 3: Check the project_stakeholders_detailed view directly
        if (supabase && user?.email) {
          const { data: stakeholderData, error: stakeholderError } = await supabase
            .from('project_stakeholders_detailed')
            .select('*')
            .limit(5);
          
          if (stakeholderError) {
            info.stakeholderViewError = stakeholderError.message;
          } else {
            info.stakeholderViewSample = stakeholderData || [];
            info.stakeholderViewColumns = stakeholderData?.[0] ? Object.keys(stakeholderData[0]) : [];
          }

          // Test 4: Check if any emails match the current user
          const { data: matchingEmails, error: emailError } = await supabase
            .from('project_stakeholders_detailed')
            .select('email, project_id, is_internal')
            .eq('is_internal', true);
          
          if (!emailError && matchingEmails) {
            info.allInternalEmails = [...new Set(matchingEmails.map(s => s.email))];
            info.userEmailFound = info.allInternalEmails.some(
              email => email?.toLowerCase() === user.email?.toLowerCase()
            );
          }
        }

        // Test 5: Alternative query - check contacts table
        if (supabase && user?.email) {
          const { data: contactData, error: contactError } = await supabase
            .from('contacts')
            .select('*')
            .ilike('email', user.email);
          
          if (!contactError) {
            info.contactsWithEmail = contactData || [];
            
            // If contact exists, check project_stakeholders
            if (contactData && contactData.length > 0) {
              const contactId = contactData[0].id;
              const { data: stakeholderAssignments, error: assignError } = await supabase
                .from('project_stakeholders')
                .select('*')
                .eq('contact_id', contactId);
              
              if (!assignError) {
                info.directStakeholderAssignments = stakeholderAssignments || [];
              }
            }
          }
        }

      } catch (error) {
        info.error = error.message;
      }

      setDebugInfo(info);
      setLoading(false);
    };

    if (user) {
      runDiagnostics();
    }
  }, [user]);

  if (loading) {
    return <div className="p-4">Loading diagnostics...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <h2 className="text-2xl font-bold mb-4">My Projects Debug Info</h2>
      
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <h3 className="font-semibold mb-2">User Info</h3>
        <div className="text-sm space-y-1">
          <div>Email: <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">{debugInfo.userEmail}</span></div>
          <div>User ID: <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">{debugInfo.userId}</span></div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <h3 className="font-semibold mb-2">Projects Summary</h3>
        <div className="text-sm space-y-1">
          <div>Total Projects: {debugInfo.allProjectsCount}</div>
          <div>My Projects Count: {debugInfo.myProjectsCount || 0}</div>
          <div>My Project IDs: {JSON.stringify(debugInfo.myProjectIds || [])}</div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <h3 className="font-semibold mb-2">Stakeholder View Check</h3>
        <div className="text-sm space-y-1">
          {debugInfo.stakeholderViewError ? (
            <div className="text-red-600">Error: {debugInfo.stakeholderViewError}</div>
          ) : (
            <>
              <div>View Columns: {JSON.stringify(debugInfo.stakeholderViewColumns || [])}</div>
              <div>User Email Found in View: {debugInfo.userEmailFound ? '✅ Yes' : '❌ No'}</div>
              <div className="mt-2">
                <div className="font-semibold">Internal Stakeholder Emails in Database:</div>
                <div className="mt-1 max-h-32 overflow-y-auto">
                  {debugInfo.allInternalEmails?.map((email, idx) => (
                    <div key={idx} className={`font-mono text-xs ${email?.toLowerCase() === debugInfo.userEmail?.toLowerCase() ? 'bg-green-100 dark:bg-green-800' : ''}`}>
                      {email}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <h3 className="font-semibold mb-2">Contact & Assignment Check</h3>
        <div className="text-sm space-y-1">
          <div>Contact Record Found: {debugInfo.contactsWithEmail?.length > 0 ? '✅ Yes' : '❌ No'}</div>
          {debugInfo.contactsWithEmail?.length > 0 && (
            <>
              <div>Contact ID: {debugInfo.contactsWithEmail[0].id}</div>
              <div>Contact Name: {debugInfo.contactsWithEmail[0].full_name}</div>
              <div>Is Internal: {debugInfo.contactsWithEmail[0].is_internal ? 'Yes' : 'No'}</div>
              <div>Project Assignments: {debugInfo.directStakeholderAssignments?.length || 0}</div>
            </>
          )}
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900 rounded-lg p-4">
        <h3 className="font-semibold mb-2">Solution</h3>
        <div className="text-sm space-y-2">
          {!debugInfo.contactsWithEmail?.length ? (
            <div>
              <p className="font-semibold text-red-600">❌ No contact record found for your email</p>
              <p className="mt-1">To fix this, you need to:</p>
              <ol className="list-decimal ml-5 mt-1">
                <li>Add a contact record with your email: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{debugInfo.userEmail}</code></li>
                <li>Mark the contact as "internal" (is_internal = true)</li>
                <li>Assign the contact to projects using the project_stakeholders table</li>
              </ol>
            </div>
          ) : debugInfo.directStakeholderAssignments?.length === 0 ? (
            <div>
              <p className="font-semibold text-yellow-600">⚠️ Contact exists but not assigned to any projects</p>
              <p className="mt-1">Your contact ID: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{debugInfo.contactsWithEmail[0].id}</code></p>
              <p className="mt-1">To fix this, assign your contact to projects in the project_stakeholders table.</p>
            </div>
          ) : (
            <div>
              <p className="font-semibold text-green-600">✅ Everything looks configured correctly</p>
              <p className="mt-1">You are assigned to {debugInfo.directStakeholderAssignments?.length} project(s)</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
        <h3 className="font-semibold mb-2">Raw Debug Data</h3>
        <pre className="text-xs overflow-x-auto">
          {JSON.stringify(debugInfo, null, 2)}
        </pre>
      </div>
    </div>
  );
};

export default MyProjectsDebug;
