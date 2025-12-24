import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useVoiceCopilot } from '../contexts/AIBrainContext';
import { Mic, MicOff, Loader2, X, Activity, Bug, Trash2, Wand2, XCircle } from 'lucide-react';

const VoiceCopilotOverlay = () => {
    const location = useLocation();
    const {
        status,
        startSession,
        endSession,
        error,
        isConfigured,
        // Debug state
        debugLog,
        audioLevel,
        lastTranscript,
        audioChunksSent,
        audioChunksReceived,
        clearDebugLog,
    } = useVoiceCopilot();

    // Derive wsState from status for backward compatibility
    const wsState = status === 'listening' || status === 'speaking' || status === 'connected' ? 'open' : 'closed';

    // Toggle helper for backward compatibility
    const toggle = useCallback(() => {
        if (status === 'idle' || status === 'error') {
            startSession();
        } else {
            endSession();
        }
    }, [status, startSession, endSession]);

    // Track tool actions (simplified - no longer provided by context)
    const lastToolAction = null;

    const [isExpanded, setIsExpanded] = useState(false);
    const [showDebug, setShowDebug] = useState(false);
    const [toolToast, setToolToast] = useState(null); // { message, success, timestamp }

    // Auto-expand on error to show message
    useEffect(() => {
        if (error) setIsExpanded(true);
    }, [error]);

    // Show toast when tool executes
    useEffect(() => {
        if (lastToolAction && lastToolAction.timestamp) {
            // Create human-readable message based on tool name
            const toolMessages = {
                'set_measurement': `Recorded ${lastToolAction.args?.field || 'measurement'}: ${lastToolAction.args?.value || ''}"`,
                'get_shade_context': 'Checking shade info...',
                'read_back_measurements': 'Reading back measurements...',
                'clear_measurement': `Cleared ${lastToolAction.args?.field || 'measurement'}`,
                'save_shade_measurements': lastToolAction.result?.success ? 'Shade saved!' : 'Save failed',
                'close_without_saving': 'Closed without saving',
                'get_shades_overview': 'Getting shades overview...',
                'list_shades_in_room': `Listing shades in ${lastToolAction.args?.roomName || 'room'}...`,
                'open_shade_for_measuring': `Opening ${lastToolAction.args?.shadeName || 'shade'}...`,
                'get_next_pending_shade': 'Finding next shade...',
                'expand_room': `Expanding ${lastToolAction.args?.roomName || 'room'}`,
                'get_current_location': 'Getting location...',
                'navigate_to_project': `Going to ${lastToolAction.args?.projectName || 'project'}...`,
                'navigate_to_section': `Going to ${lastToolAction.args?.section || 'section'}...`,
                'list_projects': 'Listing projects...',
                'go_back': 'Going back...'
            };

            const message = toolMessages[lastToolAction.toolName] || `Running ${lastToolAction.toolName}...`;

            setToolToast({
                message,
                success: lastToolAction.success,
                toolName: lastToolAction.toolName,
                timestamp: lastToolAction.timestamp
            });

            // Auto-hide toast after 3 seconds
            const timer = setTimeout(() => {
                setToolToast(null);
            }, 3000);

            return () => clearTimeout(timer);
        }
    }, [lastToolAction]);

    // Show on all pages (removed shades-only restriction)
    // Hide only on login and public pages
    const isPublicPage = location.pathname.includes('/login') ||
                         location.pathname.includes('/public') ||
                         location.pathname.includes('/shade-portal');

    if (isPublicPage) {
        return null;
    }

    // Handle Mic Click
    const handleToggle = () => {
        if (!isConfigured) {
            setIsExpanded(true);
            return;
        }
        toggle();
    };

    // Dynamic Styles based on Status
    const getButtonStyles = () => {
        if (!isConfigured) {
            return 'bg-zinc-300 dark:bg-zinc-700 text-zinc-400 cursor-not-allowed';
        }
        switch (status) {
            case 'connecting':
                return 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500 animate-pulse cursor-wait';
            case 'listening':
                return 'bg-violet-500 text-white shadow-lg shadow-violet-500/30 hover:bg-violet-600';
            case 'speaking':
                return 'bg-violet-600 text-white shadow-lg shadow-violet-500/50 scale-110';
            case 'error':
                return 'bg-red-500 text-white';
            default: // idle
                return 'bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 shadow-lg';
        }
    };

    const getIcon = () => {
        switch (status) {
            case 'connecting': return <Loader2 size={24} className="animate-spin" />;
            case 'listening': return <Mic size={24} />;
            case 'speaking': return <Activity size={24} className="animate-pulse" />;
            case 'error': return <MicOff size={24} />;
            default: return <Mic size={24} />;
        }
    };

    const getStatusMessage = () => {
        if (!isConfigured) {
            return "Voice AI not configured. Add REACT_APP_GEMINI_API_KEY to Vercel environment.";
        }
        if (status === 'error' && error) return error;
        if (status === 'listening') return "Listening... Tap to stop.";
        if (status === 'speaking') return "Speaking...";
        if (status === 'connecting') return "Connecting...";
        return "Tap to start voice assistant";
    };

    return (
        <div className="fixed bottom-24 right-4 z-50 flex flex-col items-end gap-2">
            {/* Tool Action Toast - shows when AI executes a tool */}
            {toolToast && (
                <div
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg mb-2 animate-fade-in backdrop-blur-md transition-all ${
                        toolToast.success
                            ? 'bg-violet-500/90 text-white'
                            : 'bg-red-500/90 text-white'
                    }`}
                    style={{
                        animation: 'slideInRight 0.3s ease-out'
                    }}
                >
                    {toolToast.success ? (
                        <Wand2 size={18} className="flex-shrink-0" />
                    ) : (
                        <XCircle size={18} className="flex-shrink-0" />
                    )}
                    <span className="text-sm font-medium">{toolToast.message}</span>
                </div>
            )}

            {/* Debug Panel */}
            {showDebug && (
                <div className="bg-black/90 text-green-400 p-3 rounded-lg shadow-xl mb-2 w-80 max-h-96 overflow-hidden flex flex-col font-mono text-xs">
                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-green-800">
                        <span className="font-bold text-green-300">Debug Panel</span>
                        <div className="flex gap-2">
                            <button onClick={clearDebugLog} className="text-green-500 hover:text-green-300">
                                <Trash2 size={14} />
                            </button>
                            <button onClick={() => setShowDebug(false)} className="text-green-500 hover:text-green-300">
                                <X size={14} />
                            </button>
                        </div>
                    </div>

                    {/* Status Row */}
                    <div className="grid grid-cols-2 gap-2 mb-2 text-[10px]">
                        <div className="bg-green-900/30 p-1.5 rounded">
                            <div className="text-green-600">Status</div>
                            <div className="text-green-300 font-bold">{status}</div>
                        </div>
                        <div className="bg-green-900/30 p-1.5 rounded">
                            <div className="text-green-600">WebSocket</div>
                            <div className={`font-bold ${wsState === 'open' ? 'text-green-300' : 'text-red-400'}`}>{wsState}</div>
                        </div>
                    </div>

                    {/* Audio Level Bar */}
                    <div className="mb-2">
                        <div className="text-green-600 text-[10px] mb-1">Mic Input Level</div>
                        <div className="h-3 bg-green-900/50 rounded overflow-hidden">
                            <div
                                className={`h-full transition-all duration-75 ${audioLevel > 50 ? 'bg-green-400' : audioLevel > 20 ? 'bg-green-500' : 'bg-green-700'}`}
                                style={{ width: `${audioLevel}%` }}
                            />
                        </div>
                        <div className="text-[10px] text-green-600 mt-0.5">{audioLevel}% {audioLevel === 0 && status === 'listening' ? '(No audio detected!)' : ''}</div>
                    </div>

                    {/* Chunks Counter */}
                    <div className="grid grid-cols-2 gap-2 mb-2 text-[10px]">
                        <div className="bg-green-900/30 p-1.5 rounded">
                            <div className="text-green-600">Chunks Sent</div>
                            <div className="text-green-300 font-bold">{audioChunksSent}</div>
                        </div>
                        <div className="bg-green-900/30 p-1.5 rounded">
                            <div className="text-green-600">Chunks Received</div>
                            <div className="text-green-300 font-bold">{audioChunksReceived}</div>
                        </div>
                    </div>

                    {/* Last Transcript */}
                    {lastTranscript && (
                        <div className="mb-2 bg-blue-900/30 p-1.5 rounded">
                            <div className="text-blue-400 text-[10px]">Last Response</div>
                            <div className="text-blue-200 text-[10px] truncate">{lastTranscript}</div>
                        </div>
                    )}

                    {/* Log Messages */}
                    <div className="flex-1 overflow-y-auto min-h-[100px] max-h-[150px] bg-black/50 rounded p-1">
                        {debugLog.length === 0 ? (
                            <div className="text-green-700 text-center py-4">No logs yet. Start a session.</div>
                        ) : (
                            debugLog.map((log, i) => (
                                <div key={i} className={`text-[10px] py-0.5 ${
                                    log.type === 'error' ? 'text-red-400' :
                                    log.type === 'response' ? 'text-blue-400' :
                                    log.type === 'tool' ? 'text-yellow-400' :
                                    'text-green-400'
                                }`}>
                                    <span className="text-green-700">{log.timestamp}</span> {log.message}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* Expanded Status / Error Message */}
            {(isExpanded || (status !== 'idle' && status !== 'connecting')) && !showDebug && (
                <div className={`p-3 rounded-2xl shadow-xl mb-2 backdrop-blur-md transition-all max-w-xs ${
                    status === 'error' || !isConfigured
                        ? 'bg-red-500/90 text-white'
                        : 'bg-white/90 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-700'
                    }`}>
                    <div className="flex items-start gap-3">
                        <div className="text-sm font-medium">
                            {getStatusMessage()}
                        </div>
                        <button onClick={() => setIsExpanded(false)} className="text-current opacity-70 hover:opacity-100 flex-shrink-0">
                            <X size={14} />
                        </button>
                    </div>
                </div>
            )}

            {/* Button Row */}
            <div className="flex items-center gap-2">
                {/* Debug Toggle Button */}
                <button
                    onClick={() => setShowDebug(!showDebug)}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                        showDebug
                            ? 'bg-green-500 text-white'
                            : 'bg-white dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700'
                    }`}
                >
                    <Bug size={18} />
                </button>

                {/* Main Orb Button */}
                <button
                    onClick={handleToggle}
                    className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 ${getButtonStyles()}`}
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                    {/* Ping Animation for Active Listening */}
                    {status === 'listening' && (
                        <span className="absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75 animate-ping"></span>
                    )}

                    <div className="relative z-10">
                        {getIcon()}
                    </div>
                </button>
            </div>
        </div>
    );
};

export default VoiceCopilotOverlay;
