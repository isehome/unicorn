import React, { useState, useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { enhancedStyles } from '../../styles/styleSystem';
import { Bot, Mic, MessageSquare, Sparkles, UserCog, Volume2, TestTube, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useVoiceCopilot } from '../../contexts/VoiceCopilotContext';

const AISettings = () => {
    const { mode } = useTheme();
    const sectionStyles = enhancedStyles.sections[mode];

    // Voice Copilot context for testing
    const {
        testAudioOutput,
        testMicrophoneInput,
        platformInfo,
        debugLog,
        clearDebugLog
    } = useVoiceCopilot();

    // State - Initialize from localStorage
    const [persona, setPersona] = useState(() => localStorage.getItem('ai_persona') || 'brief');
    const [voice, setVoice] = useState(() => localStorage.getItem('ai_voice') || 'Puck');
    const [instructions, setInstructions] = useState(() => localStorage.getItem('ai_custom_instructions') || '');
    const [isExpanded, setIsExpanded] = useState(false);

    // Test state
    const [testingAudio, setTestingAudio] = useState(false);
    const [testingMic, setTestingMic] = useState(false);
    const [audioTestResult, setAudioTestResult] = useState(null); // null, true, false
    const [micTestResult, setMicTestResult] = useState(null);
    const [showDebugLog, setShowDebugLog] = useState(false);

    // Save changes to localStorage
    useEffect(() => {
        localStorage.setItem('ai_persona', persona);
        localStorage.setItem('ai_voice', voice);
        localStorage.setItem('ai_custom_instructions', instructions);
    }, [persona, voice, instructions]);

    const voices = [
        { id: 'Puck', name: 'Puck (Energetic)', gender: 'Male' },
        { id: 'Charon', name: 'Charon (Deep/Calm)', gender: 'Male' },
        { id: 'Kore', name: 'Kore (Warm)', gender: 'Female' },
        { id: 'Fenrir', name: 'Fenrir (Deep)', gender: 'Male' },
        { id: 'Aoede', name: 'Aoede (Formal)', gender: 'Female' },
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

            <div className="space-y-6 pt-2">
                {/* Persona Selection */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                        <UserCog size={14} />
                        <span>Assistant Persona</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

                {/* Voice Selection */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                        <Mic size={14} />
                        <span>Voice Preference</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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

                {/* Custom Instructions */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                        <MessageSquare size={14} />
                        <span>Custom Context</span>
                    </div>
                    <div className="relative">
                        <textarea
                            value={instructions}
                            onChange={(e) => setInstructions(e.target.value)}
                            rows={3}
                            placeholder="e.g., 'I always measure in millimeters', or 'Remind me to check for obstructions'"
                            className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                        />
                    </div>
                    <p className="text-xs text-zinc-400 italic">
                        The AI will consider these instructions in every interaction.
                    </p>
                </div>

                {/* Audio & Microphone Tests */}
                <div className="space-y-3 pt-4 border-t border-zinc-200 dark:border-zinc-700">
                    <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                        <TestTube size={14} />
                        <span>Audio Diagnostics</span>
                    </div>

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
            </div>
        </section>
    );
};

export default AISettings;
