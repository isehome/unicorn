import React, { useState, useRef, useEffect } from 'react';

export default function CortexControlBar({
  onSendMessage,
  onToggleMic,
  isListening,
  onQuickAction,
  disabled = false,
}) {
  const [text, setText] = useState('');
  const inputRef = useRef(null);

  const handleSendMessage = () => {
    if (text.trim()) {
      onSendMessage(text);
      setText('');
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleQuickAction = (action) => {
    onQuickAction(action);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40">
      {/* Quick Action Buttons */}
      <div className={`flex gap-2 px-4 py-2 bg-zinc-900/50 backdrop-blur-sm border-t border-zinc-700/50 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <button
          type="button"
          onClick={() => handleQuickAction('tasks')}
          className="px-3 py-1.5 text-sm font-medium bg-zinc-700 text-zinc-300 rounded-full hover:bg-zinc-600 dark:hover:bg-zinc-600 transition-colors touch-manipulation min-h-[44px] flex items-center"
          disabled={disabled}
        >
          Tasks
        </button>
        <button
          type="button"
          onClick={() => handleQuickAction('notes')}
          className="px-3 py-1.5 text-sm font-medium bg-zinc-700 text-zinc-300 rounded-full hover:bg-zinc-600 dark:hover:bg-zinc-600 transition-colors touch-manipulation min-h-[44px] flex items-center"
          disabled={disabled}
        >
          Notes
        </button>
        <button
          type="button"
          onClick={() => handleQuickAction('schedule')}
          className="px-3 py-1.5 text-sm font-medium bg-zinc-700 text-zinc-300 rounded-full hover:bg-zinc-600 dark:hover:bg-zinc-600 transition-colors touch-manipulation min-h-[44px] flex items-center"
          disabled={disabled}
        >
          Schedule
        </button>
      </div>

      {/* Main Control Bar */}
      <div className={`bg-zinc-800/90 backdrop-blur border-t border-zinc-700/50 px-4 py-3 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="flex items-end gap-2 max-w-full">
          {/* Mic Toggle Button */}
          <button
            type="button"
            onClick={onToggleMic}
            className={`flex-shrink-0 min-h-[44px] w-[44px] rounded-lg flex items-center justify-center touch-manipulation transition-colors ${
              isListening
                ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30'
                : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600 dark:hover:bg-zinc-600'
            }`}
            disabled={disabled}
          >
            {isListening ? (
              <div className="flex flex-col items-center justify-center gap-1">
                {/* Pulsing red dot */}
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
              </div>
            ) : (
              /* Microphone icon */
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4"
                />
              </svg>
            )}
          </button>

          {/* Text Input */}
          <div className="flex-1 flex items-center bg-zinc-700/50 rounded-lg px-3 py-2">
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Talk to Cortex..."
              style={{ fontSize: '16px' }}
              className="flex-1 bg-transparent text-zinc-100 placeholder-zinc-500 outline-none dark:text-zinc-100 dark:placeholder-zinc-500"
              disabled={disabled}
            />
          </div>

          {/* Send Button (visible only when there's text) */}
          {text.trim() && (
            <button
              type="button"
              onClick={handleSendMessage}
              className="flex-shrink-0 min-h-[44px] w-[44px] rounded-lg bg-blue-600 text-white hover:bg-blue-700 dark:hover:bg-blue-700 flex items-center justify-center transition-colors touch-manipulation"
              disabled={disabled}
            >
              {/* Arrow up icon */}
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
