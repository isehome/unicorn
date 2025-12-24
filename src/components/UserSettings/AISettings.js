import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { enhancedStyles } from '../../styles/styleSystem';
import { Mic, MessageSquare, Sparkles, UserCog, Volume2, TestTube, CheckCircle, XCircle, Loader2, Copy, Check, ScrollText, Sliders, Bot, ChevronDown, ChevronRight } from 'lucide-react';
import { useVoiceCopilot } from '../../contexts/AIBrainContext';

const AISettings = () => {
    const { mode } = useTheme();
    const sectionStyles = enhancedStyles.sections[mode];

    // Voice Copilot context for testing
    const {
        testAudioOutput,
        testMicrophoneInput,
        platformInfo,
        debugLog,
        clearDebugLog,
        lastTranscript,
        status,
        audioChunksSent,
        audioChunksReceived
    } = useVoiceCopilot();

    // Conversation transcript state (persists across sessions)
    const [transcript, setTranscript] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('ai_transcript') || '[]');
        } catch {
            return [];
        }
    });
    const [copied, setCopied] = useState(false);
    const transcriptEndRef = useRef(null);

    // State - Initialize from localStorage
    const [persona, setPersona] = useState(() => localStorage.getItem('ai_persona') || 'brief');
    const [voice, setVoice] = useState(() => localStorage.getItem('ai_voice') || 'Puck');
    const [model, setModel] = useState(() => localStorage.getItem('ai_model') || 'gemini-2.5-flash-native-audio-preview-09-2025');
    const [instructions, setInstructions] = useState(() => localStorage.getItem('ai_custom_instructions') || '');

    // VAD Sensitivity settings (1-2 scale only - Gemini API only supports HIGH/LOW)
    // 1 = HIGH sensitivity (triggers easily / cuts off quickly)
    // 2 = LOW sensitivity (needs clear speech / waits patiently)
    const [vadStartSensitivity, setVadStartSensitivity] = useState(() =>
        parseInt(localStorage.getItem('ai_vad_start') || '1', 10)
    );
    const [vadEndSensitivity, setVadEndSensitivity] = useState(() =>
        parseInt(localStorage.getItem('ai_vad_end') || '2', 10)
    );

    // Test state
    const [testingAudio, setTestingAudio] = useState(false);
    const [testingMic, setTestingMic] = useState(false);
    const [audioTestResult, setAudioTestResult] = useState(null); // null, true, false
    const [micTestResult, setMicTestResult] = useState(null);
    const [showDebugLog, setShowDebugLog] = useState(false);

    // Collapsible sections state - all collapsed by default to save space
    const [expandedSections, setExpandedSections] = useState({
        persona: false,
        voice: false,
        model: false,
        vad: false,
        context: false,
        diagnostics: false,
        transcript: false
    });

    const toggleSection = (section) => {
        setExpandedSections(prev => ({
            ...prev,
            [section]: !prev[section]
        }));
    };

    // Save changes to localStorage
    useEffect(() => {
        localStorage.setItem('ai_persona', persona);
        localStorage.setItem('ai_voice', voice);
        localStorage.setItem('ai_model', model);
        localStorage.setItem('ai_custom_instructions', instructions);
        localStorage.setItem('ai_vad_start', vadStartSensitivity.toString());
        localStorage.setItem('ai_vad_end', vadEndSensitivity.toString());
    }, [persona, voice, model, instructions, vadStartSensitivity, vadEndSensitivity]);

    // Capture AI responses to transcript
    useEffect(() => {
        if (lastTranscript && lastTranscript.trim()) {
            const newEntry = {
                type: 'ai',
                text: lastTranscript,
                timestamp: new Date().toISOString()
            };
            setTranscript(prev => {
                const updated = [...prev, newEntry].slice(-50); // Keep last 50 entries
                localStorage.setItem('ai_transcript', JSON.stringify(updated));
                return updated;
            });
        }
    }, [lastTranscript]);

    // Auto-scroll transcript
    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [transcript]);

    // Copy transcript to clipboard
    const copyTranscript = async () => {
        const text = transcript.map(entry => {
            const time = new Date(entry.timestamp).toLocaleTimeString();
            return `[${time}] ${entry.type === 'ai' ? 'AI' : 'You'}: ${entry.text}`;
        }).join('\n');

        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            // Fallback for iOS
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const clearTranscript = () => {
        setTranscript([]);
        localStorage.removeItem('ai_transcript');
    };

    const voices = [
        { id: 'Puck', name: 'Puck (Energetic)', gender: 'Male' },
        { id: 'Charon', name: 'Charon (Deep/Calm)', gender: 'Male' },
        { id: 'Kore', name: 'Kore (Warm)', gender: 'Female' },
        { id: 'Fenrir', name: 'Fenrir (Deep)', gender: 'Male' },
        { id: 'Aoede', name: 'Aoede (Formal)', gender: 'Female' },
    ];

    // Available Gemini models for Live API
    const models = [
        {
            id: 'gemini-2.5-flash-native-audio-preview-12-2025',
            name: '2.5 Flash (Dec 2025)',
            description: 'Latest preview with best audio quality',
            badge: 'NEW'
        },
        {
            id: 'gemini-2.5-flash-native-audio-preview-09-2025',
            name: '2.5 Flash (Sep 2025)',
            description: 'Previous stable version',
            badge: null
        },
        {
            id: 'gemini-2.0-flash-live-001',
            name: '2.0 Flash Live',
            description: 'Legacy, deprecated Dec 2025',
            badge: null
        },
    ];

    return (
        <section className="rounded-2xl border p-4 space-y-4" style={sectionStyles.card}>
            <div className="flex items-start justify-between">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Sparkles size={18} className="text-violet-500" />
                        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">AI Copilot Settings</h2>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Configure your voice assistant's personality and behavior.</p>
                </div>
            </div>

            <div className="space-y-2 pt-2">
                {/* Persona Selection - Collapsible */}
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                    <button
                        onClick={() => toggleSection('persona')}
                        className="w-full flex items-center justify-between gap-2 p-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <UserCog size={14} className="text-zinc-500" />
                            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Assistant Persona</span>
                            <span className="text-xs text-violet-500 font-medium">{persona === 'brief' ? 'Field Partner' : 'Teacher'}</span>
                        </div>
                        {expandedSections.persona ? <ChevronDown size={16} className="text-zinc-400" /> : <ChevronRight size={16} className="text-zinc-400" />}
                    </button>
                    {expandedSections.persona && (
                        <div className="px-3 pb-3 space-y-3 border-t border-zinc-100 dark:border-zinc-800">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                                <button
                                    onClick={() => setPersona('brief')}
                                    className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${persona === 'brief'
                                            ? 'bg-violet-50 dark:bg-violet-900/20 border-violet-500 ring-1 ring-violet-500'
                                            : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 hover:border-violet-300'
                                        }`}
                                >
                                    <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center ${persona === 'brief' ? 'border-violet-500' : 'border-zinc-400'
                                        }`}>
                                        {persona === 'brief' && <div className="w-2 h-2 rounded-full bg-violet-500" />}
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">The Field Partner</h3>
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Concise, fast, and proactive. Optimized for hands-free work while measuring.</p>
                                    </div>
                                </button>

                                <button
                                    onClick={() => setPersona('detailed')}
                                    className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${persona === 'detailed'
                                            ? 'bg-violet-50 dark:bg-violet-900/20 border-violet-500 ring-1 ring-violet-500'
                                            : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 hover:border-violet-300'
                                        }`}
                                >
                                    <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center ${persona === 'detailed' ? 'border-violet-500' : 'border-zinc-400'
                                        }`}>
                                        {persona === 'detailed' && <div className="w-2 h-2 rounded-full bg-violet-500" />}
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">The Teacher</h3>
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Explains reasoning, confirms details verbally, and offers more guidance.</p>
                                    </div>
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Voice Selection - Collapsible */}
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                    <button
                        onClick={() => toggleSection('voice')}
                        className="w-full flex items-center justify-between gap-2 p-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <Mic size={14} className="text-zinc-500" />
                            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Voice Preference</span>
                            <span className="text-xs text-violet-500 font-medium">{voice}</span>
                        </div>
                        {expandedSections.voice ? <ChevronDown size={16} className="text-zinc-400" /> : <ChevronRight size={16} className="text-zinc-400" />}
                    </button>
                    {expandedSections.voice && (
                        <div className="px-3 pb-3 border-t border-zinc-100 dark:border-zinc-800">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-3">
                                {voices.map(v => (
                                    <button
                                        key={v.id}
                                        onClick={() => setVoice(v.id)}
                                        className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${voice === v.id
                                                ? 'bg-violet-500 text-white border-violet-600 shadow-sm'
                                                : 'bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                                            }`}
                                    >
                                        {v.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Model Selection - Collapsible */}
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                    <button
                        onClick={() => toggleSection('model')}
                        className="w-full flex items-center justify-between gap-2 p-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <Bot size={14} className="text-zinc-500" />
                            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">AI Model</span>
                            <span className="text-xs text-violet-500 font-medium">{models.find(m => m.id === model)?.name || 'Unknown'}</span>
                        </div>
                        {expandedSections.model ? <ChevronDown size={16} className="text-zinc-400" /> : <ChevronRight size={16} className="text-zinc-400" />}
                    </button>
                    {expandedSections.model && (
                        <div className="px-3 pb-3 border-t border-zinc-100 dark:border-zinc-800">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-3">
                                {models.map(m => (
                                    <button
                                        key={m.id}
                                        onClick={() => setModel(m.id)}
                                        className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${model === m.id
                                                ? 'bg-violet-50 dark:bg-violet-900/20 border-violet-500 ring-1 ring-violet-500'
                                                : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 hover:border-violet-300'
                                            }`}
                                    >
                                        <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center ${model === m.id ? 'border-violet-500' : 'border-zinc-400'
                                            }`}>
                                            {model === m.id && <div className="w-2 h-2 rounded-full bg-violet-500" />}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{m.name}</h3>
                                                {m.badge && (
                                                    <span className="px-1.5 py-0.5 text-[10px] font-bold bg-violet-500 text-white rounded">
                                                        {m.badge}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{m.description}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                            <p className="text-xs text-zinc-400 italic mt-2">
                                Restart voice session after changing model.
                            </p>
                        </div>
                    )}
                </div>

                {/* VAD Sensitivity Controls - Collapsible */}
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                    <button
                        onClick={() => toggleSection('vad')}
                        className="w-full flex items-center justify-between gap-2 p-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <Sliders size={14} className="text-zinc-500" />
                            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Voice Detection</span>
                            <span className="text-xs text-zinc-500">
                                {vadStartSensitivity === 1 ? 'Sensitive' : 'Standard'} / {vadEndSensitivity === 1 ? 'Quick' : 'Patient'}
                            </span>
                        </div>
                        {expandedSections.vad ? <ChevronDown size={16} className="text-zinc-400" /> : <ChevronRight size={16} className="text-zinc-400" />}
                    </button>
                    {expandedSections.vad && (
                        <div className="px-3 pb-3 border-t border-zinc-100 dark:border-zinc-800">
                            <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-xl p-4 space-y-4 mt-3">
                                {/* Start of Speech - Toggle between HIGH/LOW */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                                            Start Detection
                                        </label>
                                        <span className={`text-xs px-2 py-0.5 rounded ${
                                            vadStartSensitivity === 1
                                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                                : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400'
                                        }`}>
                                            {vadStartSensitivity === 1 ? 'Sensitive (picks up easily)' : 'Standard (needs clear speech)'}
                                        </span>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setVadStartSensitivity(1)}
                                            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                                                vadStartSensitivity === 1
                                                    ? 'bg-violet-500 text-white'
                                                    : 'bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                                            }`}
                                        >
                                            Sensitive
                                        </button>
                                        <button
                                            onClick={() => setVadStartSensitivity(2)}
                                            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                                                vadStartSensitivity === 2
                                                    ? 'bg-violet-500 text-white'
                                                    : 'bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                                            }`}
                                        >
                                            Standard
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-zinc-400">
                                        Sensitive picks up speech quickly; Standard waits for clear voice input
                                    </p>
                                </div>

                                {/* End of Speech - Toggle between QUICK/PATIENT */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                                            End Detection (Patience)
                                        </label>
                                        <span className={`text-xs px-2 py-0.5 rounded ${
                                            vadEndSensitivity === 2
                                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                                : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400'
                                        }`}>
                                            {vadEndSensitivity === 1 ? 'Quick (responds fast)' : 'Patient (waits for pauses)'}
                                        </span>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setVadEndSensitivity(1)}
                                            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                                                vadEndSensitivity === 1
                                                    ? 'bg-violet-500 text-white'
                                                    : 'bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                                            }`}
                                        >
                                            Quick
                                        </button>
                                        <button
                                            onClick={() => setVadEndSensitivity(2)}
                                            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                                                vadEndSensitivity === 2
                                                    ? 'bg-violet-500 text-white'
                                                    : 'bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                                            }`}
                                        >
                                            Patient
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-zinc-400">
                                        Quick responds after brief pause; Patient waits longer before responding
                                    </p>
                                </div>
                            </div>
                            <p className="text-xs text-zinc-400 italic mt-2">
                                Adjust if the AI interrupts you or doesn't hear you. Restart session after changing.
                            </p>
                        </div>
                    )}
                </div>

                {/* Custom Instructions - Collapsible */}
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                    <button
                        onClick={() => toggleSection('context')}
                        className="w-full flex items-center justify-between gap-2 p-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <MessageSquare size={14} className="text-zinc-500" />
                            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Custom Context</span>
                            {instructions && <span className="text-xs text-green-500">Configured</span>}
                        </div>
                        {expandedSections.context ? <ChevronDown size={16} className="text-zinc-400" /> : <ChevronRight size={16} className="text-zinc-400" />}
                    </button>
                    {expandedSections.context && (
                        <div className="px-3 pb-3 border-t border-zinc-100 dark:border-zinc-800">
                            <div className="relative pt-3">
                                <textarea
                                    value={instructions}
                                    onChange={(e) => setInstructions(e.target.value)}
                                    rows={3}
                                    placeholder="e.g., 'I always measure in millimeters', or 'Remind me to check for obstructions'"
                                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                                />
                            </div>
                            <p className="text-xs text-zinc-400 italic mt-2">
                                The AI will consider these instructions in every interaction.
                            </p>
                        </div>
                    )}
                </div>

                {/* Audio & Microphone Tests - Collapsible */}
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                    <button
                        onClick={() => toggleSection('diagnostics')}
                        className="w-full flex items-center justify-between gap-2 p-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <TestTube size={14} className="text-zinc-500" />
                            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Audio Diagnostics</span>
                        </div>
                        {expandedSections.diagnostics ? <ChevronDown size={16} className="text-zinc-400" /> : <ChevronRight size={16} className="text-zinc-400" />}
                    </button>
                    {expandedSections.diagnostics && (
                        <div className="px-3 pb-3 border-t border-zinc-100 dark:border-zinc-800 space-y-3 pt-3">
                            {/* Platform Info */}
                            <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-lg p-3 text-xs">
                                <div className="font-medium text-zinc-700 dark:text-zinc-300 mb-1">Platform Detected:</div>
                                <div className="text-zinc-500 dark:text-zinc-400 space-y-0.5">
                                    <div>iOS: <span className={platformInfo?.isIOS ? 'text-amber-600 font-medium' : 'text-green-600'}>{platformInfo?.isIOS ? 'Yes' : 'No'}</span></div>
                                    <div>Safari: <span className={platformInfo?.isSafari ? 'text-amber-600 font-medium' : 'text-green-600'}>{platformInfo?.isSafari ? 'Yes' : 'No'}</span></div>
                                </div>
                            </div>

                            {/* Test Buttons */}
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={async () => {
                                        setTestingAudio(true);
                                        setAudioTestResult(null);
                                        const result = await testAudioOutput();
                                        setAudioTestResult(result);
                                        setTestingAudio(false);
                                    }}
                                    disabled={testingAudio}
                                    className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                                        audioTestResult === true ? 'bg-green-50 border-green-300 text-green-700 dark:bg-green-900/20 dark:border-green-700 dark:text-green-400' :
                                        audioTestResult === false ? 'bg-red-50 border-red-300 text-red-700 dark:bg-red-900/20 dark:border-red-700 dark:text-red-400' :
                                        'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                                    }`}
                                >
                                    {testingAudio ? (
                                        <Loader2 size={16} className="animate-spin" />
                                    ) : audioTestResult === true ? (
                                        <CheckCircle size={16} />
                                    ) : audioTestResult === false ? (
                                        <XCircle size={16} />
                                    ) : (
                                        <Volume2 size={16} />
                                    )}
                                    {testingAudio ? 'Playing...' : 'Test Speaker'}
                                </button>

                                <button
                                    onClick={async () => {
                                        setTestingMic(true);
                                        setMicTestResult(null);
                                        const result = await testMicrophoneInput();
                                        setMicTestResult(result);
                                        setTestingMic(false);
                                    }}
                                    disabled={testingMic}
                                    className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                                        micTestResult === true ? 'bg-green-50 border-green-300 text-green-700 dark:bg-green-900/20 dark:border-green-700 dark:text-green-400' :
                                        micTestResult === false ? 'bg-red-50 border-red-300 text-red-700 dark:bg-red-900/20 dark:border-red-700 dark:text-red-400' :
                                        'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                                    }`}
                                >
                                    {testingMic ? (
                                        <Loader2 size={16} className="animate-spin" />
                                    ) : micTestResult === true ? (
                                        <CheckCircle size={16} />
                                    ) : micTestResult === false ? (
                                        <XCircle size={16} />
                                    ) : (
                                        <Mic size={16} />
                                    )}
                                    {testingMic ? 'Listening...' : 'Test Microphone'}
                                </button>
                            </div>

                            {/* Debug Log Toggle */}
                            <button
                                onClick={() => setShowDebugLog(!showDebugLog)}
                                className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
                            >
                                {showDebugLog ? 'Hide Debug Log' : 'Show Debug Log'}
                            </button>

                            {/* Debug Log */}
                            {showDebugLog && (
                                <div className="bg-black/90 text-green-400 p-3 rounded-lg font-mono text-xs max-h-60 overflow-y-auto">
                                    <div className="flex justify-between items-center mb-2 pb-2 border-b border-green-800">
                                        <span className="text-green-300 font-bold">Voice Copilot Log</span>
                                        <button onClick={clearDebugLog} className="text-green-500 hover:text-green-300 text-xs">Clear</button>
                                    </div>
                                    {debugLog.length === 0 ? (
                                        <div className="text-green-700 text-center py-4">No logs yet. Run a test above.</div>
                                    ) : (
                                        debugLog.slice(-30).map((log, i) => (
                                            <div key={i} className={`py-0.5 ${
                                                log.type === 'error' ? 'text-red-400' :
                                                log.type === 'warn' ? 'text-yellow-400' :
                                                log.type === 'audio' ? 'text-cyan-400' :
                                                'text-green-400'
                                            }`}>
                                                <span className="text-green-700">{log.timestamp}</span> {log.message}
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}

                            <p className="text-xs text-zinc-400 italic">
                                Use these tests to verify audio works on your device. iOS Safari may require tapping to enable audio.
                            </p>
                        </div>
                    )}
                </div>

                {/* Conversation Transcript - Collapsible */}
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                    <button
                        onClick={() => toggleSection('transcript')}
                        className="w-full flex items-center justify-between gap-2 p-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <ScrollText size={14} className="text-zinc-500" />
                            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Conversation Transcript</span>
                            {transcript.length > 0 && <span className="text-xs text-zinc-500">{transcript.length} messages</span>}
                            {/* Status indicator inline */}
                            <div className={`w-2 h-2 rounded-full ${
                                status === 'listening' ? 'bg-green-500 animate-pulse' :
                                status === 'speaking' ? 'bg-violet-500 animate-pulse' :
                                status === 'connecting' ? 'bg-amber-500 animate-pulse' :
                                'bg-zinc-400'
                            }`} />
                        </div>
                        {expandedSections.transcript ? <ChevronDown size={16} className="text-zinc-400" /> : <ChevronRight size={16} className="text-zinc-400" />}
                    </button>
                    {expandedSections.transcript && (
                        <div className="px-3 pb-3 border-t border-zinc-100 dark:border-zinc-800 space-y-3 pt-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4 text-xs">
                                    <span className="text-zinc-500 dark:text-zinc-400 capitalize">{status}</span>
                                    {status !== 'idle' && (
                                        <>
                                            <span className="text-zinc-400">Sent: {audioChunksSent}</span>
                                            <span className="text-zinc-400">Recv: {audioChunksReceived}</span>
                                        </>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={copyTranscript}
                                        disabled={transcript.length === 0}
                                        className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                                            copied
                                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                                        } ${transcript.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        {copied ? <Check size={12} /> : <Copy size={12} />}
                                        {copied ? 'Copied!' : 'Copy'}
                                    </button>
                                    <button
                                        onClick={clearTranscript}
                                        disabled={transcript.length === 0}
                                        className={`px-2 py-1 rounded text-xs font-medium bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 transition-colors ${
                                            transcript.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
                                        }`}
                                    >
                                        Clear
                                    </button>
                                </div>
                            </div>

                            {/* Transcript Display */}
                            <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-lg p-3 max-h-80 overflow-y-auto">
                                {transcript.length === 0 ? (
                                    <div className="text-zinc-400 text-sm text-center py-8">
                                        No conversation yet. Start a voice session to see the transcript here.
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {transcript.map((entry, i) => (
                                            <div key={i} className={`text-sm ${entry.type === 'ai' ? '' : 'text-right'}`}>
                                                <div className={`inline-block max-w-[85%] px-3 py-2 rounded-lg ${
                                                    entry.type === 'ai'
                                                        ? 'bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200'
                                                        : 'bg-violet-500 text-white'
                                                }`}>
                                                    <p className="whitespace-pre-wrap break-words">{entry.text}</p>
                                                    <p className={`text-[10px] mt-1 ${
                                                        entry.type === 'ai' ? 'text-zinc-400' : 'text-violet-200'
                                                    }`}>
                                                        {new Date(entry.timestamp).toLocaleTimeString()}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                        <div ref={transcriptEndRef} />
                                    </div>
                                )}
                            </div>

                            <p className="text-xs text-zinc-400 italic">
                                This shows what the AI said. Copy to share issues with Steve for debugging.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
};

export default AISettings;
