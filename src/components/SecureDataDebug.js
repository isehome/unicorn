import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const SecureDataDebug = ({ projectId }) => {
  const [debugInfo, setDebugInfo] = useState({
    auth: null,
    testInsert: null,
    testSelect: null,
    error: null,
    loading: true
  });

  useEffect(() => {
    runDebugTests();
  }, [projectId]);

  const runDebugTests = async () => {
    try {
      // 1. Check authentication state
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      // 2. Test SELECT
      const { data: selectData, error: selectError } = await supabase
        .from('project_secure_data')
        .select('*')
        .eq('project_id', projectId)
        .limit(1);
      
      // 3. Test INSERT
      const testData = {
        project_id: projectId,
        data_type: 'credentials',
        name: `Debug Test ${Date.now()}`,
        username: 'test',
        password: 'test123',
        notes: 'Automated debug test - safe to delete'
      };
      
      const { data: insertData, error: insertError } = await supabase
        .from('project_secure_data')
        .insert([testData])
        .select()
        .single();
      
      // 4. Clean up test data if insert succeeded
      if (insertData?.id) {
        await supabase
          .from('project_secure_data')
          .delete()
          .eq('id', insertData.id);
      }
      
      setDebugInfo({
        auth: {
          user: user ? {
            id: user.id,
            email: user.email,
            role: user.role,
            aud: user.aud,
            authenticated: true
          } : null,
          session: session ? {
            hasToken: !!session.access_token,
            tokenType: session.token_type,
            expiresAt: session.expires_at
          } : null,
          errors: { userError, sessionError }
        },
        testSelect: {
          success: !selectError,
          error: selectError,
          dataCount: selectData?.length || 0
        },
        testInsert: {
          success: !insertError,
          error: insertError,
          insertedId: insertData?.id
        },
        error: null,
        loading: false
      });
    } catch (error) {
      setDebugInfo(prev => ({
        ...prev,
        error: error.message,
        loading: false
      }));
    }
  };

  const copyDebugInfo = () => {
    const debugText = JSON.stringify(debugInfo, null, 2);
    navigator.clipboard.writeText(debugText);
    alert('Debug info copied to clipboard');
  };

  if (debugInfo.loading) {
    return <div className="p-4">Running debug tests...</div>;
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white dark:bg-zinc-800 rounded-lg p-6 max-w-4xl max-h-[80vh] overflow-auto">
        <h2 className="text-xl font-bold mb-4 text-red-600">Secure Data Debug Info</h2>
        
        <div className="space-y-4">
          {/* Authentication Status */}
          <div className="border rounded p-3">
            <h3 className="font-semibold mb-2">Authentication Status:</h3>
            <div className="text-sm space-y-1">
              <div>
                User: {debugInfo.auth?.user ?
                  <span style={{ color: '#94AF32' }}>✓ Authenticated as {debugInfo.auth.user.email}</span> : 
                  <span className="text-red-600">✗ Not authenticated</span>
                }
              </div>
              <div>
                Session: {debugInfo.auth?.session?.hasToken ?
                  <span style={{ color: '#94AF32' }}>✓ Active session</span> : 
                  <span className="text-red-600">✗ No session</span>
                }
              </div>
              {debugInfo.auth?.user && (
                <>
                  <div className="text-xs text-gray-600">User ID: {debugInfo.auth.user.id}</div>
                  <div className="text-xs text-gray-600">Role: {debugInfo.auth.user.role || 'authenticated'}</div>
                </>
              )}
            </div>
          </div>

          {/* Test Results */}
          <div className="border rounded p-3">
            <h3 className="font-semibold mb-2">Database Tests:</h3>
            <div className="text-sm space-y-2">
              <div>
                SELECT Test: {debugInfo.testSelect?.success ?
                  <span style={{ color: '#94AF32' }}>✓ Can read secure data</span> : 
                  <span className="text-red-600">✗ Cannot read - {debugInfo.testSelect?.error?.message}</span>
                }
              </div>
              <div>
                INSERT Test: {debugInfo.testInsert?.success ?
                  <span style={{ color: '#94AF32' }}>✓ Can create secure data</span> : 
                  <span className="text-red-600">✗ Cannot create - {debugInfo.testInsert?.error?.message}</span>
                }
              </div>
            </div>
          </div>

          {/* RLS Error Details */}
          {debugInfo.testInsert?.error?.message?.includes('row-level security') && (
            <div className="border border-red-500 rounded p-3 bg-red-50 dark:bg-red-900/20">
              <h3 className="font-semibold mb-2 text-red-600">RLS Policy Issue Detected!</h3>
              <div className="text-sm">
                <p className="mb-2">The RLS policies are blocking INSERT operations.</p>
                <p className="font-semibold">Quick Fix Options:</p>
                <ol className="list-decimal ml-5 mt-2 space-y-1">
                  <li>Run the SQL in <code className="bg-gray-200 px-1">supabase/fix_secure_data_rls_COMPLETE.sql</code></li>
                  <li>If that doesn't work, temporarily disable RLS by uncommenting OPTION 1 in the SQL file</li>
                  <li>Check if you're properly authenticated (should show "Authenticated" above)</li>
                </ol>
              </div>
            </div>
          )}

          {/* Raw Debug Data */}
          <details className="border rounded p-3">
            <summary className="cursor-pointer font-semibold">Raw Debug Data (click to expand)</summary>
            <pre className="text-xs mt-2 bg-gray-100 dark:bg-zinc-900 p-2 rounded overflow-auto">
              {JSON.stringify(debugInfo, null, 2)}
            </pre>
          </details>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={runDebugTests}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Re-run Tests
            </button>
            <button
              onClick={copyDebugInfo}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              Copy Debug Info
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-white rounded"
              style={{ backgroundColor: '#94AF32' }}
            >
              Reload Page
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecureDataDebug;
