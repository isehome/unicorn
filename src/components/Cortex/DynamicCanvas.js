import React from 'react';

export default function DynamicCanvas({ mode, content, children }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-zinc-900 overflow-hidden relative">
      {/* Avatar Mode */}
      <div
        className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${
          mode === 'avatar' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {children}
      </div>

      {/* Document Mode */}
      <div
        className={`absolute inset-0 transition-opacity duration-300 overflow-hidden ${
          mode === 'document' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="w-full h-full bg-zinc-100 dark:bg-zinc-800 overflow-y-auto">
          <div className="p-6 max-w-2xl mx-auto">
            <div
              className="prose prose-invert max-w-none text-zinc-900 dark:text-zinc-100"
              dangerouslySetInnerHTML={{
                __html: content?.text || '<p>No content</p>',
              }}
            />
          </div>
        </div>
      </div>

      {/* Tasks Mode */}
      <div
        className={`absolute inset-0 transition-opacity duration-300 overflow-hidden ${
          mode === 'tasks' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="w-full h-full bg-zinc-100 dark:bg-zinc-800 overflow-y-auto">
          <div className="p-6 max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">Tasks</h2>
            <div className="space-y-3">
              {content?.tasks && content.tasks.length > 0 ? (
                content.tasks.map((task, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 p-3 rounded-lg bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600"
                  >
                    <input
                      type="checkbox"
                      defaultChecked={task.completed || false}
                      className="mt-1 w-4 h-4 rounded cursor-pointer accent-violet-600"
                      onChange={(e) => {
                        // Handle task completion if callback provided
                      }}
                    />
                    <div className="flex-1">
                      <p className="text-zinc-900 dark:text-zinc-100 font-medium">
                        {task.title || task}
                      </p>
                      {task.description && (
                        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                          {task.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-zinc-600 dark:text-zinc-400">No tasks yet</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Browser Mode */}
      <div
        className={`absolute inset-0 transition-opacity duration-300 overflow-hidden ${
          mode === 'browser' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="w-full h-full flex flex-col bg-zinc-900">
          {/* Browser toolbar */}
          <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800 border-b border-zinc-700">
            <button
              type="button"
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-zinc-700 text-zinc-400 touch-manipulation"
              onClick={() => content?.onBack?.()}
              title="Back"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </button>
            <button
              type="button"
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-zinc-700 text-zinc-400 touch-manipulation"
              onClick={() => content?.onRefresh?.()}
              title="Refresh"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
            </button>
            <div className="flex-1 bg-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-300 truncate">
              {content?.url || 'about:blank'}
            </div>
            <button
              type="button"
              className="min-h-[36px] px-3 flex items-center justify-center rounded-lg hover:bg-zinc-700 text-zinc-400 text-sm touch-manipulation"
              onClick={() => content?.onClose?.()}
              title="Close browser"
            >
              ✕ Close
            </button>
          </div>
          {/* Iframe — routed through proxy to strip X-Frame-Options */}
          {content?.url && (
            <iframe
              src={`/api/cortex/proxy?url=${encodeURIComponent(content.url)}`}
              title="Cortex Browser"
              className="flex-1 w-full bg-white"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              allow="clipboard-read; clipboard-write"
              referrerPolicy="no-referrer"
            />
          )}
        </div>
      </div>

      {/* Chat Mode */}
      <div
        className={`absolute inset-0 transition-opacity duration-300 overflow-hidden ${
          mode === 'chat' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="w-full h-full bg-zinc-900 overflow-y-auto">
          <div className="p-4 max-w-3xl mx-auto space-y-4">
            {content?.messages && content.messages.length > 0 ? (
              content.messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md xl:max-w-lg px-4 py-2.5 rounded-lg ${
                      message.role === 'user'
                        ? 'bg-violet-600 text-white rounded-br-none'
                        : 'bg-zinc-700 text-zinc-100 rounded-bl-none'
                    }`}
                  >
                    <p className="break-words whitespace-pre-wrap text-sm leading-relaxed">
                      {message.content}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-zinc-500">Start a conversation...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
