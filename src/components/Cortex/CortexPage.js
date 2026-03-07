import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import HalEye from './HalEye';
import CortexControlBar from './CortexControlBar';
import DynamicCanvas from './DynamicCanvas';
import { cortexService } from '../../services/cortexService';

const ALLOWED_EMAILS = [
  'stephe@isehome.com',
  'stephe.blansette@intelligentsystemsinc.com',
];

export default function CortexPage() {
  const { user } = useAuth();

  // ALL hooks must be declared before any conditional returns (React rules-of-hooks)

  // State management
  const [messages, setMessages] = useState([]);
  const [canvasMode, setCanvasMode] = useState('avatar');
  const [halState, setHalState] = useState('idle'); // 'idle' | 'listening' | 'thinking' | 'speaking'
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [browserUrl, setBrowserUrl] = useState(null);
  const [browserHistory, setBrowserHistory] = useState([]);
  const canvasContentRef = useRef({ messages, tasks: [], text: '' });

  // Set document title on mount
  useEffect(() => {
    document.title = 'Cortex';
    return () => {
      document.title = 'Unicorn';
    };
  }, []);

  /**
   * Detect if a message is a URL/browse command
   * Handles: "open apple.com", "go to https://google.com", "browse amazon.com", or just "apple.com"
   */
  const detectBrowserCommand = useCallback((text) => {
    const trimmed = text.trim().toLowerCase();

    // Match "open/go to/browse/visit/show me [url]"
    const commandMatch = trimmed.match(/^(?:open|go\s+to|browse|visit|show\s+me|navigate\s+to|pull\s+up)\s+(.+)$/i);
    const urlCandidate = commandMatch ? commandMatch[1].trim() : trimmed;

    // Check if it looks like a URL (has a dot and no spaces, or starts with http)
    const urlPattern = /^(https?:\/\/)?[\w\-]+(\.[\w\-]+)+([\/\w\-._~:?#[\]@!$&'()*+,;=%]*)?$/i;
    if (urlPattern.test(urlCandidate)) {
      let url = urlCandidate;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      return url;
    }
    return null;
  }, []);

  /**
   * Open a URL in the canvas browser
   */
  const openBrowser = useCallback((url) => {
    setBrowserUrl(url);
    setBrowserHistory((prev) => [...prev, url]);
    setCanvasMode('browser');
    setHalState('idle');
    // Add a system message so the conversation tracks it
    setMessages((prev) => [...prev,
      { role: 'user', content: `Open ${url}` },
      { role: 'assistant', content: `Opening ${url} in the browser.` }
    ]);
  }, []);

  /**
   * Browser navigation callbacks
   */
  const browserBack = useCallback(() => {
    if (browserHistory.length > 1) {
      const newHistory = [...browserHistory];
      newHistory.pop();
      setBrowserHistory(newHistory);
      setBrowserUrl(newHistory[newHistory.length - 1]);
    }
  }, [browserHistory]);

  const browserRefresh = useCallback(() => {
    if (browserUrl) {
      // Force iframe refresh by toggling URL
      const current = browserUrl;
      setBrowserUrl(null);
      setTimeout(() => setBrowserUrl(current), 50);
    }
  }, [browserUrl]);

  const closeBrowser = useCallback(() => {
    setBrowserUrl(null);
    setCanvasMode(messages.length > 0 ? 'chat' : 'avatar');
  }, [messages]);

  // Update canvas content ref whenever state changes
  useEffect(() => {
    canvasContentRef.current = {
      messages,
      tasks: [],
      text: '',
      url: browserUrl,
      onBack: browserBack,
      onRefresh: browserRefresh,
      onClose: closeBrowser,
    };
  }, [messages, browserUrl, browserBack, browserRefresh, closeBrowser]);

  /**
   * Handle sending a message to Cortex
   * 1. Check for browser command
   * 2. Add user message
   * 3. Switch to chat mode
   * 4. Set thinking state
   * 5. Call cortexService.sendMessage()
   * 6. Add assistant response
   * 7. Return to idle
   */
  const onSendMessage = useCallback(async (text) => {
    if (!text.trim() || isProcessing) return;

    // Check if this is a browser/URL command
    const detectedUrl = detectBrowserCommand(text);
    if (detectedUrl) {
      openBrowser(detectedUrl);
      return;
    }

    try {
      setIsProcessing(true);

      // Add user message
      const userMessage = { role: 'user', content: text };
      setMessages((prev) => [...prev, userMessage]);

      // Switch to chat mode
      setCanvasMode('chat');

      // Set thinking state
      setHalState('thinking');

      // Prepare messages for service (fallback to demo if service unavailable)
      const allMessages = [...messages, userMessage];

      let response = '';
      let canvasAction = null;

      // Call cortexService if available, otherwise use demo response
      if (cortexService && cortexService.sendMessage) {
        try {
          const result = await cortexService.sendMessage(allMessages);
          response = result.response || 'I understood your message.';
          canvasAction = result.canvasAction || null;
        } catch (error) {
          console.warn('cortexService unavailable, using demo response:', error);
          response = `You said: "${text}". I'm still learning how to respond!`;
        }
      } else {
        // Demo mode if service doesn't exist
        response = `You said: "${text}". I'm still learning how to respond!`;
      }

      // Add assistant response
      const assistantMessage = { role: 'assistant', content: response };
      setMessages((prev) => [...prev, assistantMessage]);

      // Handle canvas action if provided
      if (canvasAction) {
        setCanvasMode(canvasAction);
      }

      // Return to idle
      setHalState('idle');
    } catch (error) {
      console.error('Error sending message:', error);
      setHalState('idle');
      const errorMessage = {
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
    }
  }, [messages, isProcessing]);

  /**
   * Toggle microphone listening state
   */
  const onToggleMic = useCallback(() => {
    const newListeningState = !isListening;
    setIsListening(newListeningState);

    if (newListeningState) {
      // Starting to listen
      setHalState('listening');
    } else {
      // Stopped listening
      setHalState('idle');
    }
  }, [isListening]);

  /**
   * Handle quick action button clicks
   * For now, send the action as a message: "Show me my {action}"
   */
  const onQuickAction = useCallback(
    (action) => {
      const actionMessage = `Show me my ${action}`;
      onSendMessage(actionMessage);
    },
    [onSendMessage]
  );

  // Access gating — rendered conditionally (not early return) to respect rules-of-hooks
  if (!user || !ALLOWED_EMAILS.includes(user.email)) {
    return (
      <div className="w-screen h-screen bg-zinc-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-zinc-100 mb-4">Access Denied</h1>
          <p className="text-zinc-400 text-lg">
            {user
              ? `This feature is not available for ${user.email}`
              : 'Please sign in to continue'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-zinc-900 flex flex-col overflow-hidden">
      {/* Dynamic Canvas - takes up remaining space */}
      <DynamicCanvas mode={canvasMode} content={canvasContentRef.current}>
        <HalEye state={halState} />
      </DynamicCanvas>

      {/* Control Bar - fixed at bottom */}
      <CortexControlBar
        onSendMessage={onSendMessage}
        onToggleMic={onToggleMic}
        isListening={isListening}
        onQuickAction={onQuickAction}
        disabled={isProcessing}
      />
    </div>
  );
}
