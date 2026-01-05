/**
 * TrainingModePanel.js
 * Floating panel that appears when admin enters training mode
 * Follows user around the app to train any page
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTrainingMode } from '../../contexts/TrainingModeContext';
import { useAIBrain } from '../../contexts/AIBrainContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  Bot, X, Mic, MicOff, Play, Save, RotateCcw,
  Plus, CheckCircle, AlertCircle, ChevronDown,
  Eye, EyeOff, Loader2, Square
} from 'lucide-react';

const TrainingModePanel = () => {
  const { mode } = useTheme();
  const { userRole } = useAuth();
  const {
    isTrainingMode,
    isSessionActive,
    transcript,
    sessionType,
    startTrainingSession,
    addToTranscript,
    endTrainingSession,
    cancelTrainingSession,
    exitTrainingMode,
    enterTrainingMode,
    setSessionType,
    getCurrentRouteStatus,
    getPageInfoForCurrentRoute,
  } = useTrainingMode();

  const {
    startSession: startVoiceSession,
    endSession: endVoiceSession,
    status: voiceStatus,
    setTranscriptCallback,
    clearTranscriptCallback,
    enterTrainingMode: enterAITrainingMode,
    exitTrainingMode: exitAITrainingMode,
  } = useAIBrain();

  // Panel state - ALL hooks must be before any conditional returns
  const [isMinimized, setIsMinimized] = useState(false);
  // Position panel in top-right corner with some padding, ensuring it's fully visible
  const [position, setPosition] = useState({ x: window.innerWidth - 340, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [manualInput, setManualInput] = useState('');

  const dragRef = useRef(null);

  // Memoized handlers - must be before any returns
  const handleMouseMove = useCallback((e) => {
    if (!isDragging || !dragRef.current) return;
    setPosition({
      x: e.clientX - dragRef.current.startX,
      y: e.clientY - dragRef.current.startY,
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    dragRef.current = null;
  }, []);

  // Effect for drag handling - must be before any returns
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Register transcript callback when training session is active
  useEffect(() => {
    if (isSessionActive && setTranscriptCallback) {
      console.log('[TrainingPanel] Registering transcript callback');
      setTranscriptCallback((role, content) => {
        console.log(`[TrainingPanel] Transcript received: ${role}: ${content.substring(0, 50)}...`);
        addToTranscript(role, content);
      });
      return () => {
        console.log('[TrainingPanel] Clearing transcript callback');
        clearTranscriptCallback?.();
      };
    }
  }, [isSessionActive, setTranscriptCallback, clearTranscriptCallback, addToTranscript]);

  // Log training mode state for debugging
  console.log('[TrainingModePanel] isTrainingMode:', isTrainingMode);

  // Don't render if not in training mode - AFTER all hooks
  if (!isTrainingMode) {
    return null;
  }

  // Get current state (not hooks, just function calls)
  const routeStatus = getCurrentRouteStatus();
  const pageInfo = getPageInfoForCurrentRoute();

  // Handle dragging
  const handleMouseDown = (e) => {
    if (e.target.closest('.panel-content')) return;
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX - position.x,
      startY: e.clientY - position.y,
    };
  };

  // Start training flow
  const handleStartTraining = async (type) => {
    setSessionType(type);
    const context = await startTrainingSession(type);

    // Set training mode in AIBrain so it uses the training system prompt
    enterAITrainingMode({
      pageRoute: context?.page_route || routeStatus?.route,
      pageTitle: context?.page_title || pageInfo?.pageTitle || 'this page',
      sessionType: type,
    });

    // Don't add manual intro message - let the AI start the conversation naturally
    // when the user starts the voice session
  };

  // Handle manual text input for training
  const handleSendMessage = () => {
    if (!manualInput.trim()) return;

    addToTranscript('user', manualInput);

    // Simple AI response - in production this would call an AI endpoint
    setTimeout(() => {
      addToTranscript('ai', 'Got it! Tell me more about this page, or say "done" when finished.');
    }, 500);

    setManualInput('');
  };

  // Handle voice session toggle
  const handleVoiceToggle = async () => {
    console.log('[TrainingPanel] Voice toggle clicked, current status:', voiceStatus);
    if (voiceStatus === 'idle' || voiceStatus === 'error') {
      console.log('[TrainingPanel] Starting voice session...');
      try {
        await startVoiceSession();
        console.log('[TrainingPanel] Voice session started');
      } catch (err) {
        console.error('[TrainingPanel] Failed to start voice session:', err);
      }
    } else {
      console.log('[TrainingPanel] Ending voice session...');
      endVoiceSession();
    }
  };

  // Analyze transcript using AI to extract structured training data
  // Uses Gemini directly from browser (same API key as voice)
  const analyzeTranscript = async (transcriptData) => {
    const apiKey = process.env.REACT_APP_GEMINI_API_KEY;

    if (!apiKey) {
      console.warn('[TrainingPanel] No Gemini API key, using basic extraction');
      return basicExtraction(transcriptData);
    }

    try {
      console.log('[TrainingPanel] Analyzing transcript with Gemini...');

      // Format transcript for analysis
      const formattedTranscript = transcriptData
        .map(t => `${t.role === 'ai' ? 'AI' : 'Admin'}: ${t.content}`)
        .join('\n\n');

      const prompt = `You are analyzing a training conversation between an admin and an AI assistant.
The admin was teaching the AI about a page in their application.

Page: ${pageInfo?.pageTitle || 'Unknown'} (${routeStatus?.route || 'Unknown route'})
Session Type: ${sessionType || 'initial'}

TRANSCRIPT:
${formattedTranscript}

---

Extract ALL useful information from this conversation and return a JSON object with this structure:
{
  "functional_description": "A clear description of what this page does",
  "business_context": "Why this page matters to the business",
  "workflow_position": "Where this page fits in the user's workflow",
  "real_world_use_case": "Concrete example(s) of when and how this page is used",
  "common_mistakes": ["Array of common mistakes users make"],
  "best_practices": ["Array of tips and best practices"],
  "pro_tips": ["Array of expert tips mentioned"],
  "faq": [{"question": "Common question", "answer": "Answer"}]
}

Only include fields with actual content. Return ONLY valid JSON, no markdown.`;

      // Use gemini-2.0-flash-exp for text extraction (NOT the native-audio model)
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2 }
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

      // Parse JSON from response
      const cleanedText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const extractedData = JSON.parse(cleanedText);

      console.log('[TrainingPanel] AI extraction result:', extractedData);
      return {
        functional_description: extractedData.functional_description || '',
        business_context: extractedData.business_context || '',
        workflow_position: extractedData.workflow_position || '',
        real_world_use_case: extractedData.real_world_use_case || '',
        common_mistakes: Array.isArray(extractedData.common_mistakes) ? extractedData.common_mistakes : [],
        best_practices: Array.isArray(extractedData.best_practices) ? extractedData.best_practices : [],
        pro_tips: Array.isArray(extractedData.pro_tips) ? extractedData.pro_tips : [],
        faq: Array.isArray(extractedData.faq) ? extractedData.faq : [],
        training_script: extractedData.training_script || null,
      };
    } catch (error) {
      console.error('[TrainingPanel] Error analyzing transcript:', error);
      return basicExtraction(transcriptData);
    }
  };

  // Basic extraction fallback
  const basicExtraction = (transcriptData) => {
    const userMessages = transcriptData
      .filter(t => t.role === 'user')
      .map(t => t.content)
      .join('\n\n');

    return {
      functional_description: userMessages.substring(0, 500) || 'User-provided description pending AI analysis',
      business_context: '',
      workflow_position: '',
      real_world_use_case: '',
      common_mistakes: [],
      best_practices: [],
      faq: [],
      training_script: null,
    };
  };

  // Handle cancel training
  const handleCancelTraining = () => {
    // End voice session if active
    if (voiceStatus !== 'idle') {
      endVoiceSession();
    }
    // Exit AI training mode
    exitAITrainingMode();
    // Cancel the training session
    cancelTrainingSession();
  };

  // Handle end training
  const handleEndTraining = async () => {
    setIsSaving(true);
    console.log('[TrainingPanel] Starting end training process...');
    console.log('[TrainingPanel] Transcript entries:', transcript.length);
    console.log('[TrainingPanel] Transcript:', JSON.stringify(transcript, null, 2));

    try {
      // End voice session if active
      if (voiceStatus !== 'idle') {
        console.log('[TrainingPanel] Ending voice session...');
        endVoiceSession();
      }

      // Check if we have transcript data
      if (!transcript || transcript.length === 0) {
        console.warn('[TrainingPanel] No transcript data to save!');
        addToTranscript('ai', 'No conversation recorded. Please have a conversation before saving.');
        return;
      }

      // Extract training data from transcript
      console.log('[TrainingPanel] Extracting training data from transcript...');
      const extractedData = await analyzeTranscript(transcript);
      console.log('[TrainingPanel] Extracted data:', JSON.stringify(extractedData, null, 2));

      // Save the training
      console.log('[TrainingPanel] Saving training to database...');
      const savedResult = await endTrainingSession(extractedData);
      console.log('[TrainingPanel] Save result:', savedResult);

      if (savedResult) {
        addToTranscript('ai', 'Training saved! This page is now in my knowledge base.');
      } else {
        addToTranscript('ai', 'Training processed, but may not have saved to database. Check console for details.');
      }

      // Exit AI training mode
      exitAITrainingMode();

    } catch (error) {
      console.error('[TrainingPanel] Error ending training:', error);
      addToTranscript('ai', `Sorry, there was an error saving: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Styles
  const panelBg = mode === 'dark' ? 'bg-zinc-800' : 'bg-white';
  const textPrimary = mode === 'dark' ? 'text-white' : 'text-gray-900';
  const textSecondary = mode === 'dark' ? 'text-zinc-400' : 'text-gray-500';
  const borderColor = mode === 'dark' ? 'border-zinc-700' : 'border-gray-200';
  const inputBg = mode === 'dark' ? 'bg-zinc-700' : 'bg-gray-100';

  if (isMinimized) {
    return (
      <div
        className={`fixed z-[9999] ${panelBg} rounded-full shadow-lg border-2 border-purple-500 p-3 cursor-pointer hover:scale-105 transition-transform`}
        style={{ left: position.x, top: position.y }}
        onClick={() => setIsMinimized(false)}
        onMouseDown={handleMouseDown}
      >
        <Bot className="w-6 h-6 text-purple-500" />
        {isSessionActive && (
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
        )}
      </div>
    );
  }

  return (
    <div
      className={`fixed z-[9999] ${panelBg} rounded-lg shadow-2xl border-2 border-purple-500 w-80`}
      style={{ left: position.x, top: position.y }}
    >
      {/* Header - Draggable */}
      <div
        className={`flex items-center justify-between p-3 border-b ${borderColor} cursor-move`}
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-purple-500" />
          <span className={`font-semibold ${textPrimary}`}>Brain Training</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(true)}
            className={`p-1 rounded hover:bg-zinc-700/50 ${textSecondary}`}
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <button
            onClick={exitTrainingMode}
            className={`p-1 rounded hover:bg-red-500/20 text-red-400`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="panel-content p-3 space-y-3">
        {/* Current Page Info */}
        <div className={`p-2 rounded ${mode === 'dark' ? 'bg-zinc-700/50' : 'bg-gray-100'}`}>
          <p className={`text-xs ${textSecondary}`}>Current Page</p>
          <p className={`text-sm font-medium ${textPrimary} truncate`}>
            {pageInfo?.pageTitle || routeStatus.route}
          </p>
          <p className={`text-xs ${textSecondary} truncate`}>
            {routeStatus.route}
          </p>
          <div className="flex items-center gap-2 mt-1">
            {routeStatus.hasTrained ? (
              <span className="flex items-center gap-1 text-xs text-green-500">
                <CheckCircle className="w-3 h-3" />
                Trained (v{routeStatus.version})
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-yellow-500">
                <AlertCircle className="w-3 h-3" />
                Not trained
              </span>
            )}
            {routeStatus.isPublished && (
              <span className="text-xs text-blue-500">Published</span>
            )}
          </div>
        </div>

        {/* Session Status */}
        {isSessionActive ? (
          <div className="space-y-3">
            {/* Recording indicator */}
            <div className="flex items-center justify-center gap-2 py-2">
              <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <span className={`text-sm ${textPrimary}`}>
                {sessionType === 'append' ? 'Adding to training...' :
                 sessionType === 'retrain' ? 'Retraining...' : 'Training session active'}
              </span>
            </div>

            {/* Voice controls */}
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={handleVoiceToggle}
                className={`p-3 rounded-full transition-colors ${
                  voiceStatus === 'listening' || voiceStatus === 'speaking'
                    ? 'bg-red-500 text-white animate-pulse'
                    : voiceStatus === 'connecting' || voiceStatus === 'connected'
                      ? 'bg-yellow-500 text-white'
                      : 'bg-purple-500 text-white hover:bg-purple-600'
                }`}
              >
                {voiceStatus === 'listening' || voiceStatus === 'speaking' ? (
                  <MicOff className="w-5 h-5" />
                ) : voiceStatus === 'connecting' ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Mic className="w-5 h-5" />
                )}
              </button>
              <span className={`text-xs ${textSecondary}`}>
                {voiceStatus === 'idle' ? 'Tap to speak' : voiceStatus}
              </span>
            </div>

            {/* Manual input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Type training info..."
                className={`flex-1 px-3 py-2 rounded text-sm ${inputBg} ${textPrimary} border ${borderColor} focus:outline-none focus:ring-2 focus:ring-purple-500`}
              />
              <button
                onClick={handleSendMessage}
                disabled={!manualInput.trim()}
                className="px-3 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
              >
                Send
              </button>
            </div>

            {/* Transcript toggle */}
            <button
              onClick={() => setShowTranscript(!showTranscript)}
              className={`w-full flex items-center justify-between p-2 rounded ${
                mode === 'dark' ? 'bg-zinc-700/50 hover:bg-zinc-700' : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              <span className={`text-sm ${textSecondary}`}>
                Transcript ({transcript.length} messages)
              </span>
              {showTranscript ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>

            {/* Transcript viewer */}
            {showTranscript && (
              <div className={`max-h-40 overflow-y-auto p-2 rounded text-xs ${
                mode === 'dark' ? 'bg-zinc-900' : 'bg-gray-50'
              }`}>
                {transcript.map((item, i) => (
                  <div key={i} className={`mb-2 ${item.role === 'ai' ? 'text-purple-400' : textPrimary}`}>
                    <span className="font-semibold">{item.role === 'ai' ? 'AI: ' : 'You: '}</span>
                    {item.content}
                  </div>
                ))}
                {transcript.length === 0 && (
                  <p className={textSecondary}>No messages yet. Start speaking or typing to train.</p>
                )}
              </div>
            )}

            {/* Session actions */}
            <div className="flex gap-2">
              <button
                onClick={handleCancelTraining}
                className={`flex-1 flex items-center justify-center gap-1 py-2 px-3 rounded border ${borderColor} ${textSecondary} hover:bg-zinc-700/30`}
              >
                <Square className="w-4 h-4" />
                Cancel
              </button>
              <button
                onClick={handleEndTraining}
                disabled={isSaving || transcript.length < 2}
                className={`flex-1 flex items-center justify-center gap-1 py-2 px-3 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50`}
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
            </div>
          </div>
        ) : (
          /* Start session buttons */
          <div className="space-y-2">
            {!routeStatus.hasTrained ? (
              <button
                onClick={() => handleStartTraining('initial')}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded bg-purple-600 text-white hover:bg-purple-700"
              >
                <Play className="w-4 h-4" />
                Start Training This Page
              </button>
            ) : (
              <>
                <button
                  onClick={() => handleStartTraining('append')}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded bg-blue-600 text-white hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4" />
                  Add More Training
                </button>
                <button
                  onClick={() => handleStartTraining('retrain')}
                  className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded border ${borderColor} ${textSecondary} hover:bg-zinc-700/30`}
                >
                  <RotateCcw className="w-4 h-4" />
                  Retrain from Scratch
                </button>
              </>
            )}
          </div>
        )}

        {/* Quick tips */}
        <div className={`text-xs ${textSecondary} border-t ${borderColor} pt-2`}>
          <p className="font-medium mb-1">Training Tips:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Explain what this page is for</li>
            <li>Describe real-world use cases</li>
            <li>Mention common mistakes</li>
            <li>Share expert tips</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default TrainingModePanel;
