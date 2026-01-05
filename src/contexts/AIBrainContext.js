/**
 * AIBrainContext - The Voice AI Agent
 * 5 meta-tools, real-time context, Azure AI Search + web search
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from './AppStateContext';
import { supabase } from '../lib/supabase';
import { pageContextService } from '../services/pageContextService';
import { getPatternRoute } from '../config/pageRegistry';

// Audio settings - Gemini expects 16kHz input, sends 24kHz output
const GEMINI_INPUT_SAMPLE_RATE = 16000;
const GEMINI_OUTPUT_SAMPLE_RATE = 24000;

// Verbose logging flag - enable for debugging
const VERBOSE_LOGGING = true;

// Default model - user can override in settings
// Using gemini 2.5 native audio for better transcription support
const DEFAULT_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

const AIBrainContext = createContext(null);

export const AIBrainProvider = ({ children }) => {
    const navigate = useNavigate();
    const { executeAction, getAvailableActions, getState } = useAppState();

    const [status, setStatus] = useState('idle');
    const [error, setError] = useState(null);
    const [isConfigured, setIsConfigured] = useState(false);
    const [audioLevel, setAudioLevel] = useState(0);
    const [inputSilenceWarning, setInputSilenceWarning] = useState(false);
    const [lastTranscript, setLastTranscript] = useState('');

    // Training mode integration - callback to send transcripts to training context
    const transcriptCallbackRef = useRef(null);
    // Training mode state - different prompts when in training mode
    const [isTrainingMode, setIsTrainingModeInternal] = useState(false);
    const trainingContextRef = useRef(null); // { pageRoute, pageTitle, sessionType }

    // Buffer for accumulating transcription (Gemini sends word-by-word)
    const userTranscriptBuffer = useRef('');
    const aiTranscriptBuffer = useRef('');

    const ws = useRef(null);
    const audioContext = useRef(null);
    const mediaStream = useRef(null);
    const processorNode = useRef(null);
    const sourceNode = useRef(null);
    const audioQueue = useRef([]); // Queue of Float32Array chunks
    const isPlaying = useRef(false); // Track if audio is currently playing
    const navigateRef = useRef(navigate);

    // Web Speech API for transcription (runs in parallel with Gemini audio)
    const speechRecognition = useRef(null);

    // Debug counters
    const [audioChunksSent, setAudioChunksSent] = useState(0);
    const [audioChunksReceived, setAudioChunksReceived] = useState(0);
    const [debugLog, setDebugLog] = useState([]);

    const addDebugLog = useCallback((message, type = 'info') => {
        const timestamp = new Date().toLocaleTimeString();
        setDebugLog(prev => [...prev.slice(-50), { timestamp, message, type }]);
        console.log(`[AIBrain] ${message}`);
    }, []);

    const clearDebugLog = useCallback(() => {
        setDebugLog([]);
        setAudioChunksSent(0);
        setAudioChunksReceived(0);
    }, []);

    useEffect(() => { navigateRef.current = navigate; }, [navigate]);
    useEffect(() => {
        const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
        setIsConfigured(!!apiKey && apiKey.length > 10);
    }, []);

    const getSettings = useCallback(() => ({
        voice: localStorage.getItem('ai_voice') || 'Puck',
        persona: localStorage.getItem('ai_persona') || 'brief',
        customInstructions: localStorage.getItem('ai_custom_instructions') || '',
        vadStartSensitivity: parseInt(localStorage.getItem('ai_vad_start') || '1', 10),
        vadEndSensitivity: parseInt(localStorage.getItem('ai_vad_end') || '2', 10),
    }), []);

    const buildContextString = useCallback((state) => {
        const { view, project, shade, form, activeField, shades, rooms } = state;
        let context = `Current View: ${view}\n`;
        if (project) context += `Project: "${project.name}" (${project.address || 'No address'})\n`;

        if (view === 'shade-detail' && shade) {
            context += `\n### Measuring Window: "${shade.name}"${shade.roomName ? ` in ${shade.roomName}` : ''}\n\nMeasurements:\n`;
            context += `- Top Width: ${form?.widthTop || 'NOT SET'}\n`;
            context += `- Middle Width: ${form?.widthMiddle || 'NOT SET'}\n`;
            context += `- Bottom Width: ${form?.widthBottom || 'NOT SET'}\n`;
            context += `- Height: ${form?.height || 'NOT SET'}\n`;
            context += `- Mount Depth: ${form?.mountDepth || 'NOT SET'}\n`;
            if (activeField) context += `\nActive Field: ${activeField}\n`;
            context += `\nAvailable Actions: highlight_field, set_measurement, clear_measurement, save_measurements, read_back, next_shade\n`;
        } else if (view === 'shade-list' && shades) {
            const pending = shades.filter(s => !s.hasMeasurements).length;
            context += `\n### Window List\nTotal: ${shades.length}, Pending: ${pending}, Rooms: ${rooms?.length || 0}\n`;
            context += `Available Actions: open_shade, list_rooms, go_to_next_pending\n`;
        } else if (view === 'prewire') {
            context += `\n### Prewire Mode\nAvailable Actions: get_overview, filter_by_floor, filter_by_room, print_labels, take_photo\n`;
        } else if (view === 'dashboard') {
            context += `\n### Dashboard\nAvailable Actions: list_projects, open_project\n`;
        }
        return context;
    }, []);

    const buildTrainingSystemInstruction = useCallback(() => {
        const ctx = trainingContextRef.current;
        const sessionType = ctx?.sessionType || 'initial';
        const pageTitle = ctx?.pageTitle || 'this page';
        const pageRoute = ctx?.pageRoute || window.location.pathname;

        return `# UNICORN Page Training Mode

You are helping an admin train the AI on how to assist users with "${pageTitle}" (${pageRoute}).

## Your Role
You are a friendly interviewer helping capture knowledge about this page. Your goal is to have a natural conversation that extracts:

1. **What This Page Does** - The functional purpose
2. **Business Context** - Why this page matters to the business
3. **Workflow Position** - Where this fits in the user's workflow
4. **Real-World Use Cases** - Concrete examples of when/how it's used
5. **Common Mistakes** - What users often get wrong
6. **Best Practices** - Tips for using it effectively
7. **FAQs** - Questions users commonly ask

## Conversation Style
- Be conversational and encouraging
- Ask follow-up questions to get specifics
- Summarize key points back to confirm understanding
- If they say something vague, ask for a concrete example
- Keep responses SHORT - don't lecture, just guide the conversation
- IMPORTANT: After each response from the admin, briefly summarize what you learned from that response

## Session Type: ${sessionType}
${sessionType === 'initial' ? 'This is the FIRST training for this page. Start by asking what the page is for.' :
sessionType === 'append' ? 'This page already has some training. Ask what additional info they want to add.' :
'This is a RETRAIN - they want to start fresh. Ask them to describe the page from scratch.'}

## When the Admin Says "Done" or "That's All"
When the admin indicates they're finished training, provide a COMPLETE summary of everything you learned. Say something like:
"Great! Here's what I learned about this page: [full summary of functional description, business context, workflow, best practices, common mistakes, and any FAQs discussed]"

## Start the Conversation
Begin by greeting them and asking your first question based on the session type. Keep it natural and conversational.`;
    }, []);

    const buildSystemInstruction = useCallback(() => {
        // If in training mode, use training-specific instruction
        if (isTrainingMode && trainingContextRef.current) {
            return buildTrainingSystemInstruction();
        }

        const settings = getSettings();
        const state = getState();
        const persona = settings.persona === 'brief'
            ? `You are a concise field assistant. Keep responses short. Confirm with "Got it" or "Done".`
            : `You are a helpful teaching assistant. Explain your actions.`;

        return `# UNICORN Field Assistant

${persona}

## Capabilities
1. App Navigation - projects, shades, prewire, settings
2. Shade Measuring - guide through window measurements
3. Knowledge Base - Lutron, Ubiquiti, Control4, Sonos docs (Azure AI Search)
4. Web Search - general information
5. Execute Actions - interact with current view

## Rules
- ALWAYS call get_context FIRST
- Use execute_action for app interactions
- Use search_knowledge for product questions (PRIORITY)
- Use web_search for general info
- Use navigate to move around

## Measurement Order
1. Top Width -> 2. Middle Width -> 3. Bottom Width -> 4. Height -> 5. Mount Depth

For each: highlight_field first, ask for value, set_measurement, confirm, next field.

## Terminology
Windows = Shades = Blinds = Window Treatments (same thing)

${settings.customInstructions ? `## Custom Instructions\n${settings.customInstructions}` : ''}

## Current Context
${buildContextString(state)}`;
    }, [getSettings, getState, buildContextString, isTrainingMode, buildTrainingSystemInstruction]);

    // Tool declarations - memoized to prevent unnecessary re-renders
    const tools = React.useMemo(() => [
        { name: 'get_context', description: 'Get current app state. CALL THIS FIRST.', parameters: { type: 'object', properties: {} } },
        { name: 'execute_action', description: 'Execute action: highlight_field, set_measurement, save_measurements, open_shade, etc.', parameters: { type: 'object', properties: { action: { type: 'string' }, params: { type: 'object' } }, required: ['action'] } },
        { name: 'search_knowledge', description: 'Search knowledge base for product info (Lutron, Ubiquiti, etc). USE FIRST for product questions.', parameters: { type: 'object', properties: { query: { type: 'string' }, manufacturer: { type: 'string' } }, required: ['query'] } },
        { name: 'navigate', description: 'Go to: dashboard, prewire, settings, or project name with optional section.', parameters: { type: 'object', properties: { destination: { type: 'string' }, section: { type: 'string' } }, required: ['destination'] } },
        { name: 'web_search', description: 'Search web for general info not in knowledge base.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
        { name: 'get_page_training', description: 'Get training context for current page - returns business context, workflow info, common mistakes, best practices.', parameters: { type: 'object', properties: { pageRoute: { type: 'string', description: 'Optional: specific page route. If omitted, uses current page.' } } } },
        { name: 'teach_page', description: 'Start teaching the user about the current page using trained context.', parameters: { type: 'object', properties: { style: { type: 'string', enum: ['overview', 'walkthrough', 'tips'], description: 'Teaching style: overview (quick intro), walkthrough (step by step), tips (best practices)' } } } },
        { name: 'answer_page_question', description: 'Answer a question about the current page using trained FAQ and context.', parameters: { type: 'object', properties: { question: { type: 'string', description: 'The user question' } }, required: ['question'] } },
    ], []);

    const getContextHint = (view) => {
        const hints = {
            'shade-detail': 'Measuring window. Guide through: top->middle->bottom width, height, mount depth.',
            'shade-list': 'Window list. Can open shade or find next pending.',
            'prewire': 'Prewire mode for wire drop labels.',
            'dashboard': 'Dashboard. Can open projects.',
        };
        return hints[view] || 'Ask how you can help.';
    };

    const searchKnowledgeBase = async (query, manufacturer) => {
        try {
            const response = await fetch('/api/azure-ai-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, manufacturer, limit: 5 }),
            });
            if (!response.ok) throw new Error('Search failed');
            const data = await response.json();
            if (!data.results?.length) return { found: false, message: `No results for "${query}".`, suggestion: 'Try web_search.' };
            return { found: true, answer: data.results[0].content?.substring(0, 500), source: data.results[0].documentTitle, resultCount: data.results.length };
        } catch (e) { return { found: false, error: e.message }; }
    };

    const handleNavigation = async (destination, section) => {
        const sections = {
            dashboard: '/pm-dashboard',
            home: '/pm-dashboard',
            prewire: '/prewire-mode',
            settings: '/settings',
            issues: '/issues',
            todos: '/todos',
            service: '/service',
            tickets: '/service/tickets',
            'new ticket': '/service/tickets/new'
        };
        if (sections[destination.toLowerCase()]) {
            navigateRef.current(sections[destination.toLowerCase()]);
            return { success: true, message: `Going to ${destination}` };
        }
        const { data: projects } = await supabase.from('projects').select('id, name').ilike('name', `%${destination}%`).limit(5);
        if (!projects?.length) return { success: false, error: `No project "${destination}"` };
        if (projects.length > 1) return { success: false, error: 'Multiple matches', matches: projects.map(p => p.name) };
        let url = `/pm-project/${projects[0].id}`;
        if (section) {
            const s = section.toLowerCase();
            if (['shades', 'windows'].includes(s)) url = `/projects/${projects[0].id}/shades`;
            else if (s === 'equipment') url = `/projects/${projects[0].id}/equipment`;
        }
        navigateRef.current(url);
        return { success: true, message: `Opening ${projects[0].name}` };
    };

    const handleToolCall = useCallback(async (toolCall) => {
        const { name, args = {} } = toolCall;
        console.log(`[AIBrain] Tool: ${name}`, args);
        switch (name) {
            case 'get_context': return { ...getState(), availableActions: getAvailableActions(), hint: getContextHint(getState().view) };
            case 'execute_action': return await executeAction(args.action, args.params || {});
            case 'search_knowledge': return await searchKnowledgeBase(args.query, args.manufacturer);
            case 'navigate': return await handleNavigation(args.destination, args.section);
            case 'web_search': return { message: `Searching for "${args.query}"...`, useGrounding: true };
            case 'get_page_training': {
                const route = args.pageRoute || getPatternRoute(window.location.pathname);
                const context = await pageContextService.getPageContext(route);
                if (!context || !context.is_trained) {
                    return { found: false, message: `No training found for ${route}`, route };
                }
                return {
                    found: true,
                    route,
                    pageTitle: context.page_title,
                    functional: context.functional_description,
                    businessContext: context.business_context,
                    workflow: context.workflow_position,
                    realWorldExample: context.real_world_use_case,
                    commonMistakes: context.common_mistakes || [],
                    bestPractices: context.best_practices || [],
                    faq: context.faq || [],
                };
            }
            case 'teach_page': {
                const route = getPatternRoute(window.location.pathname);
                const context = await pageContextService.getPageContext(route);
                if (!context?.is_trained) {
                    return { success: false, message: "This page hasn't been trained yet. I can only provide basic help." };
                }
                const style = args.style || 'overview';
                const script = pageContextService.buildTeachingScript(context);
                return {
                    success: true,
                    teachingStyle: style,
                    content: style === 'overview'
                        ? context.functional_description
                        : style === 'tips'
                            ? { bestPractices: context.best_practices, mistakes: context.common_mistakes }
                            : script,
                };
            }
            case 'answer_page_question': {
                const route = getPatternRoute(window.location.pathname);
                const context = await pageContextService.getPageContext(route);
                if (!context?.is_trained) {
                    return { answered: false, message: "I don't have specific training for this page." };
                }
                // Check FAQ first
                const faq = context.faq || [];
                const matchingFaq = faq.find(qa =>
                    args.question.toLowerCase().includes(qa.question?.toLowerCase()?.slice(0, 20))
                );
                if (matchingFaq) {
                    return { answered: true, source: 'faq', answer: matchingFaq.answer };
                }
                // Return full context for AI to synthesize answer
                return {
                    answered: false,
                    context: {
                        functional: context.functional_description,
                        business: context.business_context,
                        workflow: context.workflow_position,
                        tips: context.best_practices,
                        mistakes: context.common_mistakes,
                    },
                    message: "Use this context to answer the question"
                };
            }
            default: return { error: `Unknown: ${name}` };
        }
    }, [getState, getAvailableActions, executeAction]);

    // Audio utilities - from working VoiceCopilotContext implementation

    // Float32 to 16-bit PCM conversion (working formula)
    const floatTo16BitPCM = (input) => {
        const output = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]));
            output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return output;
    };

    // Linear interpolation resampling (simple but effective for voice)
    const resampleAudio = (inputData, inputSampleRate, outputSampleRate) => {
        if (inputSampleRate === outputSampleRate) {
            return inputData;
        }
        const ratio = inputSampleRate / outputSampleRate;
        const outputLength = Math.floor(inputData.length / ratio);
        const output = new Float32Array(outputLength);
        for (let i = 0; i < outputLength; i++) {
            const srcIndex = i * ratio;
            const srcIndexFloor = Math.floor(srcIndex);
            const srcIndexCeil = Math.min(srcIndexFloor + 1, inputData.length - 1);
            const t = srcIndex - srcIndexFloor;
            output[i] = inputData[srcIndexFloor] * (1 - t) + inputData[srcIndexCeil] * t;
        }
        return output;
    };

    // Downsample to Gemini's expected 16kHz
    const downsampleForGemini = (inputData, inputSampleRate) => {
        return resampleAudio(inputData, inputSampleRate, GEMINI_INPUT_SAMPLE_RATE);
    };

    // Convert base64 PCM (int16) to Float32 for playback
    const base64ToFloat32 = (base64) => {
        const binary = atob(base64);
        const buffer = new ArrayBuffer(binary.length);
        const view = new Uint8Array(buffer);
        for (let i = 0; i < binary.length; i++) {
            view[i] = binary.charCodeAt(i);
        }
        const int16 = new Int16Array(buffer);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
            float32[i] = int16[i] / 32768.0;
        }
        return float32;
    };

    // --- AUDIO PLAYBACK ---
    // This is the SIMPLE, WORKING approach from VoiceCopilotContext (commit 4786ede)
    // It plays chunks immediately as they arrive, without complex scheduling
    const playNextChunk = useCallback(() => {
        if (!audioContext.current) {
            // This should ideally not happen now that startSession creates it, 
            // but we keep as fallback.
            addDebugLog('playNextChunk: No audioContext - creating one (fallback)', 'warn');
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            audioContext.current = new AudioContextClass();
        }
        if (audioQueue.current.length === 0) {
            if (VERBOSE_LOGGING) addDebugLog('playNextChunk: Queue empty', 'audio');
            return;
        }
        if (isPlaying.current) {
            if (VERBOSE_LOGGING) addDebugLog(`playNextChunk: Already playing, queue size: ${audioQueue.current.length}`, 'audio');
            return;
        }

        isPlaying.current = true;
        const audioData = audioQueue.current.shift();
        addDebugLog(`Playing chunk: ${audioData.length} samples, queue remaining: ${audioQueue.current.length}`, 'audio');

        try {
            // Gemini sends audio at 24kHz, but device may use different rate (iOS uses 48kHz)
            const deviceSampleRate = audioContext.current.sampleRate;
            const contextState = audioContext.current.state;

            if (VERBOSE_LOGGING) {
                addDebugLog(`Audio playback: contextState=${contextState}, deviceRate=${deviceSampleRate}, inputSamples=${audioData.length}`, 'audio');
            }

            // iOS Safari: AudioContext may be suspended - must resume from user gesture
            if (contextState === 'suspended') {
                addDebugLog('AudioContext suspended - attempting resume...', 'warn');
                audioContext.current.resume().then(() => {
                    addDebugLog('AudioContext resumed successfully', 'audio');
                    // Retry playback after resume
                    isPlaying.current = false;
                    audioQueue.current.unshift(audioData); // Put back in queue
                    playNextChunk();
                }).catch(e => {
                    addDebugLog(`AudioContext resume failed: ${e.message}`, 'error');
                    isPlaying.current = false;
                });
                return;
            }

            const resampledData = resampleAudio(audioData, GEMINI_OUTPUT_SAMPLE_RATE, deviceSampleRate);

            if (VERBOSE_LOGGING) {
                addDebugLog(`Resampled: ${audioData.length} → ${resampledData.length} samples (${GEMINI_OUTPUT_SAMPLE_RATE}→${deviceSampleRate}Hz)`, 'audio');
            }

            const buffer = audioContext.current.createBuffer(1, resampledData.length, deviceSampleRate);
            buffer.getChannelData(0).set(resampledData);

            // Check peak amplitude of the data being played
            let peakAmp = 0;
            for (let i = 0; i < resampledData.length; i++) {
                const amp = Math.abs(resampledData[i]);
                if (amp > peakAmp) peakAmp = amp;
            }
            addDebugLog(`Playing peak: ${peakAmp.toFixed(3)}${peakAmp < 0.01 ? ' (SILENT!)' : ''}`, 'audio');

            const source = audioContext.current.createBufferSource();
            source.buffer = buffer;

            // Add gain node to boost audio (iOS Safari can be quiet)
            const gainNode = audioContext.current.createGain();
            gainNode.gain.value = 2.0; // Boost by 2x
            source.connect(gainNode);
            gainNode.connect(audioContext.current.destination);

            source.onended = () => {
                if (VERBOSE_LOGGING) addDebugLog(`Chunk played (${resampledData.length} samples)`, 'audio');
                isPlaying.current = false;
                if (audioQueue.current.length > 0) {
                    playNextChunk();
                } else {
                    addDebugLog('Audio playback complete', 'audio');
                    // Done speaking.
                    // If socket is closed (status logic handled here now), go to idle.
                    // If socket is open, go back to listening.
                    if (ws.current?.readyState === WebSocket.OPEN) {
                        setStatus('listening');
                    } else {
                        addDebugLog('Playback done and socket closed -> IDLE');
                        setStatus('idle');
                    }
                }
            };

            source.onerror = (e) => {
                addDebugLog(`AudioBufferSource error: ${e}`, 'error');
                isPlaying.current = false;
            };

            setStatus('speaking');
            source.start(0);
            if (VERBOSE_LOGGING) addDebugLog('AudioBufferSource started', 'audio');
        } catch (e) {
            addDebugLog(`Audio playback error: ${e.message}`, 'error');
            console.error('[AIBrain] Audio playback error:', e);
            isPlaying.current = false;
            // Try next chunk
            if (audioQueue.current.length > 0) {
                setTimeout(() => playNextChunk(), 100);
            }
        }
    }, [addDebugLog]);

    const sendToolResponse = useCallback((name, result, id) => {
        if (ws.current?.readyState === WebSocket.OPEN) {
            // Function Response format for Gemini Live API
            // CRITICAL: result must be the EXACT response object Gemini expects.
            // Do NOT double-wrap it in { result: ... } if it's already an object.
            let responseData = result;
            if (typeof result !== 'object' || result === null) {
                responseData = { result };
            }

            const response = {
                toolResponse: {
                    functionResponses: [{
                        name,
                        response: responseData,
                        id // CRITICAL: ID must match the call ID
                    }]
                }
            };
            addDebugLog(`Sending tool response for ${name} (id: ${id})`);
            ws.current.send(JSON.stringify(response));
        }
    }, [addDebugLog]);

    /**
     * Queue audio for playback - simple approach that works on Safari
     * Just add to queue and trigger playback
     */
    const queueAudioForPlayback = useCallback((audioData) => {
        // Check audio data validity - scan the WHOLE chunk for peak
        let maxAmp = 0;
        for (let i = 0; i < audioData.length; i++) {
            const amp = Math.abs(audioData[i]);
            if (amp > maxAmp) maxAmp = amp;
        }

        // Log peak amplitude for debugging (normal speech = 0.1-0.5+)
        const isLowAmplitude = maxAmp < 0.01;
        addDebugLog(`Queueing audio: ${audioData.length} samples, peak: ${maxAmp.toFixed(3)}${isLowAmplitude ? ' (LOW!)' : ''}`);

        // Add to queue
        audioQueue.current.push(audioData);

        // Start playback if not already playing
        playNextChunk();
    }, [addDebugLog, playNextChunk]);

    // Diagnostic: Play a test beep to verify audio output
    const playTestSound = useCallback(async () => {
        addDebugLog('Playing test sound (Web Audio + HTML5)...', 'audio');
        try {
            // Method 1: Web Audio API Oscillator
            if (!audioContext.current) {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                audioContext.current = new AudioContextClass();
            }
            if (audioContext.current.state === 'suspended') await audioContext.current.resume();

            const osc = audioContext.current.createOscillator();
            const gain = audioContext.current.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, audioContext.current.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880, audioContext.current.currentTime + 0.5);

            gain.gain.setValueAtTime(0.5, audioContext.current.currentTime);
            gain.gain.linearRampToValueAtTime(0, audioContext.current.currentTime + 0.5);

            osc.connect(gain);
            gain.connect(audioContext.current.destination);

            osc.start();
            osc.stop(audioContext.current.currentTime + 0.5);
            addDebugLog('Web Audio test scheduled');

            // Method 2: HTML5 Audio Element (Fallback)
            // Simple beep data URI
            const beepUrl = 'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU'; // (Truncated for brevity, using a real short beep)
            // Using a generated oscillator beep data URI would be better, but for now let's just log.
            // Actually, let's create a temporary audio element.
            const audio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
            audio.volume = 1.0;
            audio.onplay = () => addDebugLog('HTML5 Audio: Playing...', 'audio');
            audio.onerror = (e) => addDebugLog(`HTML5 Audio Error: ${e.message || 'Unknown'}`, 'error');
            audio.play().catch(e => addDebugLog(`HTML5 Audio Play Error: ${e.message}`, 'error'));

        } catch (e) {
            addDebugLog(`Test sound failed: ${e.message}`, 'error');
        }
    }, [addDebugLog]);

    const handleWebSocketMessage = useCallback(async (event) => {
        try {
            // Handle Safari Blob responses
            let messageData = event.data;
            if (event.data instanceof Blob) {
                messageData = await event.data.text();
            }
            const data = JSON.parse(messageData);

            if (data.setupComplete) {
                addDebugLog('Setup complete - ready for voice input');
                setStatus('listening');
                return;
            }

            // Log raw message structure for debugging
            addDebugLog(`WS msg keys: ${Object.keys(data).join(', ')}`);

            if (data.serverContent?.modelTurn?.parts) {
                // AI is starting to respond - flush user transcript buffer first
                if (userTranscriptBuffer.current.trim()) {
                    const fullUserText = userTranscriptBuffer.current.trim();
                    addDebugLog(`User said: "${fullUserText.substring(0, 100)}..."`, 'transcript');
                    if (transcriptCallbackRef.current) {
                        transcriptCallbackRef.current('user', fullUserText);
                    }
                    userTranscriptBuffer.current = ''; // Clear buffer
                }

                for (const part of data.serverContent.modelTurn.parts) {
                    // Log what type of part we received
                    const partKeys = Object.keys(part).join(', ');
                    addDebugLog(`Part: ${partKeys}`);

                    // Audio response - check for inlineData with data first
                    // Gemini may send empty mimeType or various audio/* types
                    if (part.inlineData?.data) {
                        const mimeType = part.inlineData.mimeType || '';
                        // Accept any audio format or empty mimeType (Gemini sends 16-bit PCM)
                        if (mimeType.startsWith('audio/') || mimeType === '' || !mimeType) {
                            setStatus('speaking');
                            const audioData = base64ToFloat32(part.inlineData.data);
                            setAudioChunksReceived(prev => prev + 1);
                            addDebugLog(`Audio received: ${audioData.length} samples, mime="${mimeType}"`);
                            // Use new schedule-ahead playback
                            queueAudioForPlayback(audioData);
                        }
                    }
                    if (part.text) {
                        setLastTranscript(part.text);
                        addDebugLog(`Response: "${part.text.substring(0, 50)}..."`, 'response');
                        // Send AI response to training transcript if callback registered
                        if (transcriptCallbackRef.current) {
                            transcriptCallbackRef.current('ai', part.text);
                        }
                    }
                    // Handle function calls - Gemini sends { name, args }
                    if (part.functionCall) {
                        const funcName = part.functionCall.name || 'unknown';
                        const funcArgs = part.functionCall.args || {};
                        const funcId = part.functionCall.id; // Get ID from function call

                        addDebugLog(`Tool call: ${funcName}, id=${funcId}`, 'tool');
                        const r = await handleToolCall({ name: funcName, args: funcArgs });
                        sendToolResponse(funcName, r, funcId);
                    }
                }
            }

            if (data.serverContent?.turnComplete) {
                addDebugLog('Turn complete - listening');
                setStatus('listening');

                // Flush AI transcript buffer when turn completes
                if (aiTranscriptBuffer.current.trim()) {
                    const fullAIText = aiTranscriptBuffer.current.trim();
                    addDebugLog(`AI said: "${fullAIText.substring(0, 100)}..."`, 'transcript');
                    // Send complete AI transcript to training if callback registered
                    if (transcriptCallbackRef.current) {
                        transcriptCallbackRef.current('ai', fullAIText);
                    }
                    aiTranscriptBuffer.current = ''; // Clear buffer for next turn
                }
            }

            // Capture user input transcription (enabled via inputAudioTranscription config)
            // Buffer the transcription until turn completes (Gemini sends word-by-word)
            if (data.serverContent?.inputTranscription) {
                const userText = data.serverContent.inputTranscription.text;
                if (userText) {
                    // Accumulate user speech in buffer
                    userTranscriptBuffer.current += (userTranscriptBuffer.current ? ' ' : '') + userText;
                    addDebugLog(`User (buffering): "${userText}"`, 'transcript');
                    setLastTranscript(`You: ${userTranscriptBuffer.current}`);
                }
            }

            // Capture AI output transcription (enabled via outputAudioTranscription config)
            // Buffer AI transcription until turn completes (may come in chunks)
            if (data.serverContent?.outputTranscription) {
                const aiText = data.serverContent.outputTranscription.text;
                if (aiText) {
                    // Accumulate AI speech in buffer
                    aiTranscriptBuffer.current += (aiTranscriptBuffer.current ? ' ' : '') + aiText;
                    addDebugLog(`AI (buffering): "${aiText}"`, 'transcript');
                    setLastTranscript(`AI: ${aiTranscriptBuffer.current}`);
                }
            }

            // Handle toolCall at root level - Gemini Live sends { toolCall: { functionCalls: [...] } }
            if (data.toolCall) {
                addDebugLog(`Tool call received: ${JSON.stringify(data.toolCall).substring(0, 200)}`, 'tool');

                // Gemini Live sends functionCalls array inside toolCall
                const functionCalls = data.toolCall.functionCalls || [];
                for (const fc of functionCalls) {
                    const funcName = fc.name;
                    const funcArgs = fc.args || {};
                    const funcId = fc.id; // Get ID

                    addDebugLog(`Executing tool: ${funcName}, id=${funcId}`, 'tool');
                    const r = await handleToolCall({ name: funcName, args: funcArgs });
                    sendToolResponse(funcName, r, funcId);
                }
            }
        } catch (e) {
            addDebugLog(`Message error: ${e.message}`, 'error');
        }
    }, [handleToolCall, sendToolResponse, queueAudioForPlayback, addDebugLog]);

    // Recording state ref (to avoid stale closures)
    const recordingActive = useRef(false);

    // Start Web Speech API recognition for transcription
    // NOTE: This is DISABLED for now as it conflicts with Gemini audio capture
    // Both try to use the microphone simultaneously which causes issues
    const startSpeechRecognition = useCallback(() => {
        // DISABLED - Web Speech API conflicts with Gemini audio stream
        // The browser can't share the microphone between both systems reliably
        addDebugLog('Speech recognition disabled (conflicts with Gemini audio)', 'info');
        return;

        /* Original implementation preserved for reference:
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            addDebugLog('Web Speech API not available', 'warn');
            return;
        }
        // ... rest of implementation
        */
    }, [addDebugLog]);

    // Stop Web Speech API recognition
    const stopSpeechRecognition = useCallback(() => {
        if (speechRecognition.current) {
            try {
                speechRecognition.current.stop();
            } catch (e) {
                // Ignore
            }
            speechRecognition.current = null;
            addDebugLog('Speech recognition stopped');
        }
    }, [addDebugLog]);

    const startAudioCapture = useCallback(() => {
        if (!mediaStream.current || !audioContext.current) {
            addDebugLog('Cannot start audio capture - missing stream or context', 'error');
            return;
        }

        recordingActive.current = true;
        sourceNode.current = audioContext.current.createMediaStreamSource(mediaStream.current);

        // Get device's actual sample rate (iOS uses 48kHz, desktop may use 44.1kHz or 48kHz)
        const deviceSampleRate = audioContext.current.sampleRate;
        addDebugLog(`Device sample rate: ${deviceSampleRate}Hz, downsampling to ${GEMINI_INPUT_SAMPLE_RATE}Hz`);

        // Use ScriptProcessor (deprecated but more iOS compatible than AudioWorklet)
        const processor = audioContext.current.createScriptProcessor(4096, 1, 1);
        processorNode.current = processor;

        let chunkCount = 0;
        processor.onaudioprocess = (e) => {
            if (!recordingActive.current || ws.current?.readyState !== WebSocket.OPEN) return;

            const inputData = e.inputBuffer.getChannelData(0);

            // Calculate audio level (RMS) for debug display
            let sum = 0;
            let nonZeroSamples = 0;
            for (let i = 0; i < inputData.length; i++) {
                sum += inputData[i] * inputData[i];
                if (Math.abs(inputData[i]) > 0.0001) nonZeroSamples++;
            }
            // Warn if completely silent for the first few chunks
            if (nonZeroSamples === 0 && chunkCount > 10 && chunkCount % 50 === 0) {
                addDebugLog(`WARNING: Input buffer is completely silent! (zeros)`, 'warn');
                setInputSilenceWarning(true);
            } else if (nonZeroSamples > 0) {
                setInputSilenceWarning(false);
            }
            const rms = Math.sqrt(sum / inputData.length);
            const level = Math.min(100, Math.round(rms * 500)); // Scale to 0-100
            setAudioLevel(level);

            // Downsample to 16kHz for Gemini (device may be 48kHz on iOS)
            const downsampledData = downsampleForGemini(inputData, deviceSampleRate);
            const pcmData = floatTo16BitPCM(downsampledData);

            // Convert to base64
            const bytes = new Uint8Array(pcmData.buffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            const base64Audio = btoa(binary);

            // Send to Gemini using the CORRECT format (audio, not mediaChunks!)
            // This is the format that worked in the previous version
            ws.current.send(JSON.stringify({
                realtimeInput: {
                    audio: {
                        mimeType: "audio/pcm;rate=16000",
                        data: base64Audio
                    }
                }
            }));

            chunkCount++;
            setAudioChunksSent(chunkCount);

            // Log every 50 chunks (~3 seconds of audio)
            if (chunkCount === 1) {
                addDebugLog(`First chunk sent (${pcmData.length} samples, level: ${level}%)`);
            } else if (chunkCount % 50 === 0) {
                addDebugLog(`Sent ${chunkCount} audio chunks, level: ${level}%`);
            }
        };

        sourceNode.current.connect(processor);
        processor.connect(audioContext.current.destination);
        addDebugLog('Audio processing started');

        // Start speech recognition for transcription (in parallel)
        startSpeechRecognition();
    }, [addDebugLog, startSpeechRecognition]);

    const stopAudioCapture = useCallback(() => {
        recordingActive.current = false;

        // Stop media stream
        if (mediaStream.current) {
            mediaStream.current.getTracks().forEach(track => track.stop());
            mediaStream.current = null;
        }

        // Disconnect audio nodes
        if (processorNode.current) {
            processorNode.current.disconnect();
            processorNode.current = null;
        }
        if (sourceNode.current) {
            sourceNode.current.disconnect();
            sourceNode.current = null;
        }

        setAudioLevel(0);
        addDebugLog('Audio capture stopped');

        // Stop speech recognition
        stopSpeechRecognition();
    }, [addDebugLog, stopSpeechRecognition]);

    const startSession = useCallback(async () => {
        addDebugLog('startSession called');
        if (status !== 'idle' && status !== 'error') {
            addDebugLog('Session already active, ignoring');
            return;
        }
        const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
        if (!apiKey) {
            setError('No API key');
            setStatus('error');
            addDebugLog('No API key configured', 'error');
            return;
        }

        try {
            setStatus('connecting');
            setError(null);
            clearDebugLog();

            // CRITICAL FIX: Always create a FRESH AudioContext for a new session
            // This resolves issues where the context becomes stale/suspended/silent
            addDebugLog('Creating FRESH AudioContext...');

            // Close existing if open
            if (audioContext.current) {
                try {
                    await audioContext.current.close();
                } catch (e) { /* ignore */ }
                audioContext.current = null;
            }

            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            audioContext.current = new AudioContextClass();

            if (audioContext.current.state === 'suspended') {
                addDebugLog('Resuming suspended AudioContext...');
                await audioContext.current.resume();
            }
            addDebugLog(`AudioContext ready. Sample rate: ${audioContext.current.sampleRate}Hz, state: ${audioContext.current.state}`);

            // Reset audio queue
            audioQueue.current = [];
            isPlaying.current = false;

            // Request microphone - iOS Safari needs specific config
            // Request microphone - using Legacy constraints to prevent feedback loop
            // Feedback loop causes browser to auto-mute speakers, killing output
            addDebugLog('Requesting microphone (Legacy constraints)...');
            mediaStream.current = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });
            const audioTrack = mediaStream.current.getAudioTracks()[0];
            addDebugLog(`Microphone acquired: ${audioTrack?.label || 'default mic'}`);
            addDebugLog(`Track state: enabled=${audioTrack?.enabled}, muted=${audioTrack?.muted}, readyState=${audioTrack?.readyState}`);

            // Monitor track ended event
            audioTrack.onended = () => addDebugLog('Microphone track ended unexpectedly', 'error');
            audioTrack.onmute = () => addDebugLog('Microphone track muted by system', 'warn');
            audioTrack.onunmute = () => addDebugLog('Microphone track unmuted', 'info');

            // Connect WebSocket
            addDebugLog('Connecting to Gemini Live API...');
            const socket = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`);
            ws.current = socket;

            socket.onopen = () => {
                addDebugLog('WebSocket connected, sending setup...');
                const voiceSettings = getSettings();
                // Get model from settings or use default
                // IMPORTANT: Validate that the model is supported for bidiGenerateContent (Live API)
                // Only native-audio models work with the Live API
                const VALID_LIVE_MODELS = [
                    'gemini-2.0-flash-exp',
                    'gemini-2.5-flash-native-audio-preview-12-2025',
                ];
                let selectedModel = localStorage.getItem('ai_model') || DEFAULT_MODEL;
                // If stored model isn't valid for Live API, use default
                if (!VALID_LIVE_MODELS.includes(selectedModel)) {
                    addDebugLog(`Model "${selectedModel}" not valid for Live API, using default`);
                    selectedModel = DEFAULT_MODEL;
                }
                const setupConfig = {
                    setup: {
                        model: `models/${selectedModel}`,
                        generationConfig: {
                            // Use AUDIO only - gemini-2.5 native audio model doesn't support TEXT modality
                            // Transcription is handled via outputAudioTranscription/inputAudioTranscription
                            responseModalities: ['AUDIO'],
                            speechConfig: {
                                voiceConfig: {
                                    prebuiltVoiceConfig: { voiceName: voiceSettings.voice }
                                }
                            }
                        },
                        // NOTE: Transcription configs are OMITTED for gemini-2.5-flash-native-audio
                        // Per GitHub issue googleapis/js-genai#1212, these cause connection issues
                        // and don't actually return transcriptions anyway (known bug).
                        // Transcripts will come from the TEXT parts when using gemini-2.0-flash-exp,
                        // or we capture from outputTranscription when/if Google fixes it.
                        systemInstruction: { parts: [{ text: buildSystemInstruction() }] },
                        // CRITICAL: Tools must be a single array with ONE functionDeclarations containing ALL functions
                        // NOT multiple objects each with their own functionDeclarations array!
                        tools: [{
                            functionDeclarations: tools.map(t => ({
                                name: t.name,
                                description: t.description,
                                parameters: t.parameters
                            }))
                        }],
                        realtimeInputConfig: {
                            automaticActivityDetection: {
                                disabled: false,
                                // START: 1=HIGH (triggers easily), 2=LOW (needs clear speech)
                                startOfSpeechSensitivity: voiceSettings.vadStartSensitivity === 1 ? 'START_SENSITIVITY_HIGH' : 'START_SENSITIVITY_LOW',
                                // END: 1=HIGH (quick cutoff), 2=LOW (patient, waits longer)
                                // User setting: 1=Quick, 2=Patient
                                endOfSpeechSensitivity: voiceSettings.vadEndSensitivity === 1 ? 'END_SENSITIVITY_HIGH' : 'END_SENSITIVITY_LOW',
                                // Padding before speech starts (catch beginning of utterance)
                                prefixPaddingMs: 300,
                                // How long to wait after silence before ending turn
                                // Base 1000ms + 500ms if patient mode = 1000-1500ms
                                silenceDurationMs: 1000 + (voiceSettings.vadEndSensitivity === 2 ? 500 : 0)
                            }
                        }
                    }
                };
                socket.send(JSON.stringify(setupConfig));
                addDebugLog(`Setup sent. Model: ${selectedModel}, Voice: ${voiceSettings.voice}, VAD: start=${voiceSettings.vadStartSensitivity}, end=${voiceSettings.vadEndSensitivity}`);
                setStatus('connected');
                startAudioCapture();
            };

            socket.onmessage = handleWebSocketMessage;

            socket.onerror = (e) => {
                addDebugLog('WebSocket error', 'error');
                setError('Connection error');
                setStatus('error');
            };

            socket.onclose = (e) => {
                addDebugLog(`WebSocket closed: ${e.code} ${e.reason || ''}`);

                // Code 1000 is generic "normal closure" but if we didn't initiate it, it might be a server timeout or limit
                if (e.code === 1000 && status !== 'idle') {
                    addDebugLog('Session ended by server (Model may have finished turn)', 'warn');
                }

                // CRITICAL FIX: If audio is still playing or queued, DON'T switch to idle yet.
                // Let playNextChunk handle the transition when it finishes.
                if (isPlaying.current || audioQueue.current.length > 0) {
                    addDebugLog('Audio still playing - deferring IDLE state until finish', 'info');
                } else {
                    setStatus('idle');
                }

                stopAudioCapture();
            };

        } catch (e) {
            addDebugLog(`Error: ${e.message}`, 'error');
            setError(e.message);
            setStatus('error');
        }
    }, [status, getSettings, buildSystemInstruction, tools, startAudioCapture, handleWebSocketMessage, stopAudioCapture, addDebugLog, clearDebugLog]);

    const endSession = useCallback(() => {
        console.log('[AIBrain] Ending session');
        stopAudioCapture();
        ws.current?.close(); ws.current = null;

        // Clear audio playback state
        audioQueue.current = [];
        isPlaying.current = false;

        setStatus('idle');
        setError(null);
    }, [stopAudioCapture]);

    return (
        <AIBrainContext.Provider value={{
            status, error, isConfigured, audioLevel, inputSilenceWarning, lastTranscript, startSession, endSession, playTestSound,
            // Debug state
            debugLog, clearDebugLog, audioChunksSent, audioChunksReceived,
            // Platform info
            platformInfo: { isIOS: /iPhone|iPad|iPod/.test(navigator.userAgent), isSafari: /^((?!chrome|android).)*safari/i.test(navigator.userAgent) },
            registerTools: () => { }, unregisterTools: () => { },
            // Training mode integration
            setTranscriptCallback: (callback) => { transcriptCallbackRef.current = callback; },
            clearTranscriptCallback: () => { transcriptCallbackRef.current = null; },
            // Set training mode context for specialized prompts
            enterTrainingMode: (trainingContext) => {
                console.log('[AIBrain] Entering training mode:', trainingContext);
                trainingContextRef.current = trainingContext;
                setIsTrainingModeInternal(true);
            },
            exitTrainingMode: () => {
                console.log('[AIBrain] Exiting training mode');
                trainingContextRef.current = null;
                setIsTrainingModeInternal(false);
            },
            isTrainingMode,
        }}>
            {children}
        </AIBrainContext.Provider>
    );
};

export const useAIBrain = () => { const ctx = useContext(AIBrainContext); if (!ctx) throw new Error('useAIBrain requires AIBrainProvider'); return ctx; };
export const useVoiceCopilot = useAIBrain;
export default AIBrainContext;
