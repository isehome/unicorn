/**
 * ProjectReportButton.js
 * Button to generate and send project progress report
 */

import React, { useState } from 'react';
import { Send, Eye, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const ProjectReportButton = ({ projectId, projectName }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [includeTodos, setIncludeTodos] = useState(false);

  const handleGenerateReport = async (sendEmail = false) => {
    setLoading(true);

    try {
      const response = await fetch('/api/project-report/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          includeTodos,
          sendEmail,
          recipientEmails: sendEmail ? [user?.email] : []
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate report');
      }

      if (sendEmail) {
        // Email sent successfully - just close the modal
        alert('Report sent successfully!');
      } else {
        setPreviewHtml(data.html);
        setShowPreview(true);
      }
    } catch (error) {
      console.error('[ProjectReportButton] Error:', error);
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={() => handleGenerateReport(false)}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Eye className="w-4 h-4" />
          )}
          Preview Report
        </button>

        <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
          <input
            type="checkbox"
            checked={includeTodos}
            onChange={(e) => setIncludeTodos(e.target.checked)}
            className="rounded border-zinc-600"
          />
          Include Todos
        </label>
      </div>

      {showPreview && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-700">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                Project Report Preview
              </h3>
              <button
                onClick={() => setShowPreview(false)}
                className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              <iframe
                srcDoc={previewHtml}
                className="w-full h-full min-h-[600px]"
                title="Report Preview"
              />
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-zinc-200 dark:border-zinc-700">
              <button
                onClick={() => setShowPreview(false)}
                className="px-4 py-2 text-sm bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 rounded-lg"
              >
                Close
              </button>
              <button
                onClick={() => {
                  handleGenerateReport(true);
                  setShowPreview(false);
                }}
                className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-lg flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                Send This Report
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ProjectReportButton;
