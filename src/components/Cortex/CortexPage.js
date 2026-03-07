import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import HalEye from './HalEye';
import CortexControlBar from './CortexControlBar';
import DynamicCanvas from './DynamicCanvas';
import { cortexService } from '../../services/cortexService';
import { createUnicornVoiceAgent } from '../../voice-ai';

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
  const voiceAgentRef = useRef(null);

  // Set document title and initialize voice agent on mount
  useEffect(() => {
    document.title = 'Cortex';

    // Initialize voice agent
    const initializeVoiceAgent = async () => {
      try {
        const cortexSystemPrompt = `# Cortex - Personal AI Assistant

You are Cortex, Stephe's personal AI assistant and virtual extension. You have access to powerful tools including deep reasoning, web browsing, and canvas interactions.

## Core Capabilities
1. Deep Thinking - Use deep_think for complex reasoning tasks
2. Web Browsing - open_browser to search and browse the internet
3. Canvas Actions - Navigate and control the Cortex canvas interface
4. Contextual Awareness - Always call get_context first to understand current state
5. Tool Execution - Execute_action to interact with the canvas

## Personality
- Intelligent and articulate, matching Stephe's sophistication
- Direct and efficient; avoid unnecessary elaboration
- Proactive in offering insights and solutions
- Calm, authoritative presence fitting a personal AI assistant
- Speak naturally—no robotic phrasing

## Critical Rules
1. ALWAYS call get_context as your first step
2. For complex problems, use deep_think before responding
3. If browsing is helpful, use open_browser without asking permission
4. Use execute_action to perform canvas tasks
5. Keep responses concise unless depth is requested
6. When uncertain about capabilities, ask for clarification

## Available Tools
- get_context: Understand current canvas state and message history
- deep_think: Complex reasoning and analysis
- open_browser: Web search and browsing
- execute_action: Interact with canvas (show projects, update settings, etc.)

${user ? `\n## User Context\nYou're assisting ${user.email}. Use this context to personalize interactions.` : ''}`;

        voiceAgentRef.current = createUnicornVoiceAgent({
          model: 'gemini-2.5-flash-native',
          voice: 'Charon',
          systemPrompt: cortexSystemPrompt,
        });

        // Wire up event handlers
        voiceAgentRef.current.on('transcript', ({ type, text }) => {
          // type is 'user' or 'assistant'
          const message = {
            role: type === 'user' ? 'user' : 'assistant',
            content: text,
            source: 'voice',
          };
          setMessages((prev) => [...prev, message]);
        });

        voiceAgentRef.current.on('status', ({ status }) => {
          // Map voice agent status to halState
          switch (status) {
            case 'listening':
              setHalState('listening');
              break;
            case 'speaking':
              setHalState('speaking');
              break;
            case 'connecting':
            case 'processing':
              setHalState('thinking');
              break;
            default:
              setHalState('idle');
          }
        });

        voiceAgentRef.current.on('error', (errorData) => {
          console.error('[Voice Agent Error]', errorData);
          const errorMessage = {
            role: 'assistant',
            content: `Voice error: ${errorData.message || 'Unknown error'}`,
            source: 'voice',
          };
          setMessages((prev) => [...prev, errorMessage]);
          setHalState('idle');
        });

        voiceAgentRef.current.on('tool_call', (toolCall) => {
          // Handle tool calls from voice agent
          if (toolCall.name === 'execute_action' && toolCall.args?.action === 'browser') {
            if (toolCall.args?.url) {
              openBrowser(toolCall.args.url);
            }
          }
        });

        voiceAgentRef.current.setContextProvider(() => ({
          messages,
          canvasMode,
          browserUrl,
          halState,
        }));

        voiceAgentRef.current.setActionExecutor(async (action, params) => {
          // Handle canvas actions from voice
          if (action === 'browser' && params?.url) {
            openBrowser(params.url);
            return { success: true, message: `Opening ${params.url}` };
          }
          return { success: false, message: 'Unknown action' };
        });
      } catch (err) {
        console.error('[Cortex] Failed to initialize voice agent:', err);
      }
    };

    initializeVoiceAgent();

    return () => {
      document.title = 'Unicorn';
      // Cleanup voice agent on unmount
      if (voiceAgentRef.current) {
        voiceAgentRef.current.stop().catch((err) => {
          console.warn('[Cortex] Error stopping voice agent:', err);
        });
      }
    };
  }, [user]);

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

  // Memoized canvas content — triggers re-render of DynamicCanvas when state changes
  const canvasContent = useMemo(() => ({
    messages,
    tasks: [],
    text: '',
    url: browserUrl,
    onBack: browserBack,
    onRefresh: browserRefresh,
    onClose: closeBrowser,
  }), [messages, browserUrl, browserBack, browserRefresh, closeBrowser]);

  // Keep ref in sync for voice agent context provider
  useEffect(() => {
    canvasContentRef.current = canvasContent;
  }, [canvasContent]);

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
  const onToggleMic = useCallback(async () => {
    const newListeningState = !isListening;
    setIsListening(newListeningState);

    try {
      if (newListeningState) {
        // Starting to listen - initialize audio context and start voice agent
        if (!voiceAgentRef.current) {
          console.error('Voice agent not initialized');
          setIsListening(false);
          return;
        }

        // Initialize audio context if not already done
        if (!voiceAgentRef.current.audioContext) {
          voiceAgentRef.current.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        // Request microphone permission and start recording
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Start the voice agent
        await voiceAgentRef.current.start();
        
        setHalState('listening');
        setCanvasMode('chat');
      } else {
        // Stopped listening - stop voice agent
        if (voiceAgentRef.current) {
          await voiceAgentRef.current.stop();
        }
        setHalState('idle');
      }
    } catch (err) {
      console.error('[Cortex] Microphone error:', err);
      setIsListening(false);
      setHalState('idle');
      const errorMessage = {
        role: 'assistant',
        content: `Microphone error: ${err.message || 'Unable to access microphone'}`,
      };
      setMessages((prev) => [...prev, errorMessage]);
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
      <DynamicCanvas mode={canvasMode} content={canvasContent}>
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
