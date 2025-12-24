/**
 * AIBrainContext - The Voice AI Agent
 * 5 meta-tools, real-time context, Azure AI Search + web search
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from './AppStateContext';
import { supabase } from '../lib/supabase';

// Audio settings - Gemini expects 16kHz input, sends 24kHz output
const GEMINI_INPUT_SAMPLE_RATE = 16000;
const GEMINI_OUTPUT_SAMPLE_RATE = 24000;

// Audio playback settings (from Google's official live-api-web-console)
const BUFFER_SIZE = 7680; // samples per chunk
const SCHEDULE_AHEAD_TIME = 0.2; // 200ms - schedule buffers this far ahead

// Default model - user can override in settings
// The native audio model works best for voice
const DEFAULT_MODEL = 'gemini-2.5-flash-native-audio-preview-09-2025';

const AIBrainContext = createContext(null);

export const AIBrainProvider = ({ children }) => {
    const navigate = useNavigate();
    const { executeAction, getAvailableActions, getState } = useAppState();

    const [status, setStatus] = useState('idle');
    const [error, setError] = useState(null);
    const [isConfigured, setIsConfigured] = useState(false);
    const [audioLevel, setAudioLevel] = useState(0);
    const [lastTranscript, setLastTranscript] = useState('');

    const ws = useRef(null);
    const audioContext = useRef(null);
    const mediaStream = useRef(null);
    const processorNode = useRef(null);
    const sourceNode = useRef(null);
    const audioQueue = useRef([]); // Queue of Float32Array chunks
    const scheduledTime = useRef(0); // Next scheduled playback time
    const gainNode = useRef(null); // For volume control
    const silentAudio = useRef(null); // iOS mute switch workaround
    const navigateRef = useRef(navigate);

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

    const buildSystemInstruction = useCallback(() => {
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
    }, [getSettings, getState, buildContextString]);

    // Tool declarations - memoized to prevent unnecessary re-renders
    const tools = React.useMemo(() => [
        { name: 'get_context', description: 'Get current app state. CALL THIS FIRST.', parameters: { type: 'object', properties: {} } },
        { name: 'execute_action', description: 'Execute action: highlight_field, set_measurement, save_measurements, open_shade, etc.', parameters: { type: 'object', properties: { action: { type: 'string' }, params: { type: 'object' } }, required: ['action'] } },
        { name: 'search_knowledge', description: 'Search knowledge base for product info (Lutron, Ubiquiti, etc). USE FIRST for product questions.', parameters: { type: 'object', properties: { query: { type: 'string' }, manufacturer: { type: 'string' } }, required: ['query'] } },
        { name: 'navigate', description: 'Go to: dashboard, prewire, settings, or project name with optional section.', parameters: { type: 'object', properties: { destination: { type: 'string' }, section: { type: 'string' } }, required: ['destination'] } },
        { name: 'web_search', description: 'Search web for general info not in knowledge base.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
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
        const sections = { dashboard: '/pm-dashboard', home: '/pm-dashboard', prewire: '/prewire-mode', settings: '/settings', issues: '/issues', todos: '/todos' };
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

    // Convert Float32Array to WAV format bytes (for HTML Audio element playback)
    // This is more Safari-compatible than AudioBufferSourceNode
    const float32ToWav = (float32Data, sampleRate) => {
        // Convert Float32 to Int16
        const int16Data = new Int16Array(float32Data.length);
        for (let i = 0; i < float32Data.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Data[i]));
            int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // WAV file format
        const numChannels = 1;
        const bitsPerSample = 16;
        const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
        const blockAlign = numChannels * (bitsPerSample / 8);
        const dataSize = int16Data.length * (bitsPerSample / 8);
        const fileSize = 44 + dataSize; // 44 byte header + data

        const buffer = new ArrayBuffer(fileSize);
        const view = new DataView(buffer);

        // RIFF header
        writeString(view, 0, 'RIFF');
        view.setUint32(4, fileSize - 8, true); // file size - 8
        writeString(view, 8, 'WAVE');

        // fmt chunk
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true); // chunk size
        view.setUint16(20, 1, true); // audio format (1 = PCM)
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);

        // data chunk
        writeString(view, 36, 'data');
        view.setUint32(40, dataSize, true);

        // Write audio data
        const dataOffset = 44;
        for (let i = 0; i < int16Data.length; i++) {
            view.setInt16(dataOffset + i * 2, int16Data[i], true);
        }

        return buffer;
    };

    // Helper to write string to DataView
    const writeString = (view, offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    /**
     * iOS Mute Switch Workaround
     * Web Audio API respects the hardware mute switch, but HTML5 <audio> does not.
     * By playing a silent audio track, we force Web Audio onto the media channel.
     * See: https://github.com/feross/unmute-ios-audio
     */
    const setupiOSAudioUnlock = useCallback(() => {
        if (silentAudio.current) return; // Already set up

        // Create a short silent audio data URL (1 second of silence)
        // This is a valid WAV file with silence
        const silentWav = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';

        const audio = new Audio(silentWav);
        audio.loop = true;
        audio.volume = 0.01; // Near-silent but not zero (some browsers optimize away zero volume)
        audio.setAttribute('playsinline', 'true'); // iOS requirement

        silentAudio.current = audio;
        addDebugLog('iOS audio unlock element created');
    }, [addDebugLog]);

    /**
     * Start silent audio playback to unlock iOS audio
     * Must be called from user gesture (button click)
     */
    const unlockiOSAudio = useCallback(async () => {
        if (!silentAudio.current) {
            setupiOSAudioUnlock();
        }

        try {
            await silentAudio.current.play();
            addDebugLog('iOS silent audio playing - audio unlocked');
        } catch (e) {
            addDebugLog(`iOS audio unlock failed: ${e.message}`, 'error');
        }
    }, [setupiOSAudioUnlock, addDebugLog]);

    /**
     * Schedule-ahead audio playback (from Google's live-api-web-console)
     * This approach schedules buffers ahead of time to prevent gaps
     */
    const scheduleAudioPlayback = useCallback(() => {
        if (!audioContext.current || !gainNode.current) return;
        if (audioQueue.current.length === 0) return;

        const ctx = audioContext.current;
        const currentTime = ctx.currentTime;

        // If we've fallen behind, reset scheduled time to now
        if (scheduledTime.current < currentTime) {
            scheduledTime.current = currentTime;
        }

        // Schedule buffers while we have them and we're within the schedule-ahead window
        while (audioQueue.current.length > 0 &&
               scheduledTime.current < currentTime + SCHEDULE_AHEAD_TIME) {

            const chunk = audioQueue.current.shift();

            // Resample from Gemini's 24kHz to device sample rate
            const deviceRate = ctx.sampleRate;
            const resampled = resampleAudio(chunk, GEMINI_OUTPUT_SAMPLE_RATE, deviceRate);

            // Create audio buffer
            const buffer = ctx.createBuffer(1, resampled.length, deviceRate);
            buffer.getChannelData(0).set(resampled);

            // Create source and connect to gain node
            const source = ctx.createBufferSourceNode();
            source.buffer = buffer;
            source.connect(gainNode.current);

            // Schedule playback
            const startTime = Math.max(scheduledTime.current, currentTime);
            source.start(startTime);

            // Update scheduled time for next buffer
            const duration = resampled.length / deviceRate;
            scheduledTime.current = startTime + duration;

            // Log occasionally
            if (audioQueue.current.length % 5 === 0) {
                addDebugLog(`Scheduled audio: ${resampled.length} samples, queue: ${audioQueue.current.length}`);
            }
        }
    }, [addDebugLog]);

    const sendToolResponse = useCallback((name, result) => {
        if (ws.current?.readyState === WebSocket.OPEN) {
            const response = { toolResponse: { functionResponses: [{ name, response: result }] } };
            addDebugLog(`Sending tool response for ${name}`);
            ws.current.send(JSON.stringify(response));
        }
    }, [addDebugLog]);

    /**
     * Process incoming audio and schedule for playback
     * Uses Google's schedule-ahead approach for smooth playback
     */
    const queueAudioForPlayback = useCallback(async (audioData) => {
        if (!audioContext.current) {
            addDebugLog('queueAudioForPlayback: No AudioContext!', 'error');
            return;
        }

        // Resume AudioContext if suspended (Safari does this!)
        if (audioContext.current.state === 'suspended') {
            addDebugLog('Resuming suspended AudioContext...');
            try {
                await audioContext.current.resume();
                addDebugLog(`AudioContext resumed: ${audioContext.current.state}`);
            } catch (e) {
                addDebugLog(`Resume failed: ${e.message}`, 'error');
            }
        }

        // Ensure gain node exists and is connected
        if (!gainNode.current) {
            gainNode.current = audioContext.current.createGain();
            gainNode.current.gain.value = 1.0;
            gainNode.current.connect(audioContext.current.destination);
            addDebugLog('Gain node created and connected');
        }

        // Check audio data validity
        let maxAmp = 0;
        for (let i = 0; i < Math.min(audioData.length, 500); i++) {
            maxAmp = Math.max(maxAmp, Math.abs(audioData[i]));
        }
        addDebugLog(`Queueing audio: ${audioData.length} samples, peak: ${maxAmp.toFixed(3)}`);

        // Add to queue
        audioQueue.current.push(audioData);

        // Schedule playback
        scheduleAudioPlayback();
    }, [addDebugLog, scheduleAudioPlayback]);

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
                    }
                    // Handle function calls - Gemini sends { name, args }
                    if (part.functionCall) {
                        const funcName = part.functionCall.name || 'unknown';
                        const funcArgs = part.functionCall.args || {};
                        addDebugLog(`Tool call: ${funcName}(${JSON.stringify(funcArgs).substring(0, 50)})`, 'tool');
                        const r = await handleToolCall({ name: funcName, args: funcArgs });
                        sendToolResponse(funcName, r);
                    }
                }
            }

            if (data.serverContent?.turnComplete) {
                addDebugLog('Turn complete - listening');
                setStatus('listening');
            }

            // Handle toolCall at root level - Gemini Live sends { toolCall: { functionCalls: [...] } }
            if (data.toolCall) {
                addDebugLog(`Tool call received: ${JSON.stringify(data.toolCall).substring(0, 200)}`, 'tool');

                // Gemini Live sends functionCalls array inside toolCall
                const functionCalls = data.toolCall.functionCalls || [];
                for (const fc of functionCalls) {
                    const funcName = fc.name;
                    const funcArgs = fc.args || {};
                    addDebugLog(`Executing tool: ${funcName}(${JSON.stringify(funcArgs).substring(0, 50)})`, 'tool');
                    const r = await handleToolCall({ name: funcName, args: funcArgs });
                    sendToolResponse(funcName, r);
                }
            }
        } catch (e) {
            addDebugLog(`Message error: ${e.message}`, 'error');
        }
    }, [handleToolCall, sendToolResponse, queueAudioForPlayback, addDebugLog]);

    // Recording state ref (to avoid stale closures)
    const recordingActive = useRef(false);

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
            for (let i = 0; i < inputData.length; i++) {
                sum += inputData[i] * inputData[i];
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
    }, [addDebugLog]);

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
    }, [addDebugLog]);

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

            // iOS Mute Switch Workaround - play silent audio to unlock Web Audio
            // This must happen from user gesture (which startSession is called from)
            await unlockiOSAudio();

            // Create AudioContext - iOS Safari requires user gesture, don't specify sample rate
            addDebugLog('Creating AudioContext...');
            if (!audioContext.current || audioContext.current.state === 'closed') {
                // Don't specify sample rate - let device use native rate (we'll resample)
                audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioContext.current.state === 'suspended') {
                addDebugLog('Resuming suspended AudioContext...');
                await audioContext.current.resume();
            }
            addDebugLog(`AudioContext ready. Sample rate: ${audioContext.current.sampleRate}Hz, state: ${audioContext.current.state}`);

            // Create gain node for volume control
            gainNode.current = audioContext.current.createGain();
            gainNode.current.gain.value = 1.0;
            gainNode.current.connect(audioContext.current.destination);
            addDebugLog('Audio gain node connected');

            // Reset scheduling state
            scheduledTime.current = 0;
            audioQueue.current = [];

            // Request microphone - iOS Safari needs specific config
            addDebugLog('Requesting microphone...');
            mediaStream.current = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });
            const audioTrack = mediaStream.current.getAudioTracks()[0];
            addDebugLog(`Microphone acquired: ${audioTrack?.label || 'default mic'}`);

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
                    'gemini-2.5-flash-native-audio-preview-09-2025',
                    'gemini-2.0-flash-live-001-native-audio', // if this ever exists
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
                            responseModalities: ['AUDIO'],
                            speechConfig: {
                                voiceConfig: {
                                    prebuiltVoiceConfig: { voiceName: voiceSettings.voice }
                                }
                            }
                        },
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
                                startOfSpeechSensitivity: voiceSettings.vadStartSensitivity === 1 ? 'START_SENSITIVITY_HIGH' : 'START_SENSITIVITY_LOW',
                                endOfSpeechSensitivity: voiceSettings.vadEndSensitivity === 1 ? 'END_SENSITIVITY_LOW' : 'END_SENSITIVITY_HIGH',
                                // More patient VAD settings for field techs
                                prefixPaddingMs: 200,
                                silenceDurationMs: 800 + (voiceSettings.vadEndSensitivity * 200)
                            }
                        }
                    }
                };
                socket.send(JSON.stringify(setupConfig));
                addDebugLog(`Setup sent. Model: ${selectedModel}, Voice: ${voiceSettings.voice}`);
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
                setStatus('idle');
                stopAudioCapture();
            };

        } catch (e) {
            addDebugLog(`Error: ${e.message}`, 'error');
            setError(e.message);
            setStatus('error');
        }
    }, [status, getSettings, buildSystemInstruction, tools, startAudioCapture, handleWebSocketMessage, stopAudioCapture, addDebugLog, clearDebugLog, unlockiOSAudio]);

    const endSession = useCallback(() => {
        stopAudioCapture();
        ws.current?.close(); ws.current = null;

        // Clear audio playback state
        audioQueue.current = [];
        scheduledTime.current = 0;

        // Stop silent audio (iOS unlock)
        if (silentAudio.current) {
            silentAudio.current.pause();
        }

        // Disconnect gain node
        if (gainNode.current) {
            gainNode.current.disconnect();
            gainNode.current = null;
        }

        setStatus('idle');
    }, [stopAudioCapture]);

    return (
        <AIBrainContext.Provider value={{
            status, error, isConfigured, audioLevel, lastTranscript, startSession, endSession,
            // Debug state
            debugLog, clearDebugLog, audioChunksSent, audioChunksReceived,
            // Platform info
            platformInfo: { isIOS: /iPhone|iPad|iPod/.test(navigator.userAgent), isSafari: /^((?!chrome|android).)*safari/i.test(navigator.userAgent) },
            registerTools: () => {}, unregisterTools: () => {},
        }}>
            {children}
        </AIBrainContext.Provider>
    );
};

export const useAIBrain = () => { const ctx = useContext(AIBrainContext); if (!ctx) throw new Error('useAIBrain requires AIBrainProvider'); return ctx; };
export const useVoiceCopilot = useAIBrain;
export default AIBrainContext;
