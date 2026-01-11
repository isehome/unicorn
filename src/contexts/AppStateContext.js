/**
 * AppStateContext - Single Source of Truth for AI-Relevant App State
 * 
 * This context provides a centralized state that the AI agent always has access to.
 * Components PUBLISH their state here, and the AI READS from here.
 * 
 * Key principle: The AI never has to guess where the user is or what they're looking at.
 * Components explicitly tell this context what they're showing.
 */

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

// Initial state structure
const initialState = {
    // Current view identifier
    view: 'unknown', // 'dashboard' | 'project-overview' | 'shade-list' | 'shade-detail' | 'prewire' | 'settings' | etc.
    
    // Project context (when inside a project)
    project: null, // { id, name, address, status }
    
    // Room context (when viewing a specific room)
    room: null, // { id, name }
    
    // Shade context (when on shade detail)
    shade: null, // { id, name, roomName, productType, etc. }
    
    // Current form state (when editing)
    form: {}, // { fieldName: value, ... }
    
    // Which field is actively focused/highlighted
    activeField: null,
    
    // List data (for context)
    projects: [], // All projects (when on dashboard)
    rooms: [], // Rooms in current project
    shades: [], // Shades in current project/room with measurement status
    wireDrops: [], // Wire drops (when in prewire)
    
    // UI state
    modal: null, // { type: 'confirmation' | 'measurement' | etc., data: {...} }
    filters: {}, // Active filters
    
    // Measurement workflow state
    measurement: {
        currentFieldIndex: 0,
        fields: ['widthTop', 'widthMiddle', 'widthBottom', 'height', 'mountDepth'],
        completedFields: [],
    },
};

// Create context
const AppStateContext = createContext(null);

// Provider component
export const AppStateProvider = ({ children }) => {
    const [appState, setAppState] = useState(initialState);
    
    // Ref for callbacks that need latest state without re-renders
    const stateRef = useRef(appState);
    stateRef.current = appState;
    
    // Action handlers registry - components register their action handlers here
    const actionHandlers = useRef({});
    
    /**
     * Publish state updates from components
     * Components call this to tell the AI what they're showing
     */
    const publishState = useCallback((updates) => {
        setAppState(prev => {
            const next = { ...prev, ...updates };
            console.log('[AppState] State updated:', Object.keys(updates).join(', '));
            return next;
        });
    }, []);
    
    /**
     * Set the current view
     */
    const setView = useCallback((view, additionalState = {}) => {
        setAppState(prev => ({
            ...prev,
            view,
            ...additionalState,
            // Clear contextual state when changing views
            ...(view !== prev.view ? { modal: null, activeField: null } : {}),
        }));
        console.log('[AppState] View changed to:', view);
    }, []);
    
    /**
     * Set project context
     */
    const setProject = useCallback((project) => {
        publishState({ project });
    }, [publishState]);
    
    /**
     * Set shade context with form data
     */
    const setShade = useCallback((shade, form = {}) => {
        publishState({ shade, form });
    }, [publishState]);
    
    /**
     * Update form field
     */
    const updateFormField = useCallback((field, value) => {
        setAppState(prev => ({
            ...prev,
            form: { ...prev.form, [field]: value },
        }));
    }, []);
    
    /**
     * Set the active/highlighted field
     */
    const setActiveField = useCallback((field) => {
        publishState({ activeField: field });
    }, [publishState]);
    
    /**
     * Register action handlers from components
     * Components call this to register callbacks the AI can invoke
     */
    const registerActions = useCallback((handlers) => {
        actionHandlers.current = { ...actionHandlers.current, ...handlers };
        console.log('[AppState] Actions registered:', Object.keys(handlers).join(', '));
    }, []);
    
    /**
     * Unregister action handlers (cleanup)
     */
    const unregisterActions = useCallback((handlerNames) => {
        handlerNames.forEach(name => {
            delete actionHandlers.current[name];
        });
        console.log('[AppState] Actions unregistered:', handlerNames.join(', '));
    }, []);
    
    /**
     * Execute an action by name
     * The AI calls this to perform actions in the app
     */
    const executeAction = useCallback(async (actionName, params = {}) => {
        const handler = actionHandlers.current[actionName];
        
        if (!handler) {
            console.warn(`[AppState] Action not available: ${actionName}`);
            return {
                success: false,
                error: `Action '${actionName}' is not available in the current context.`,
                availableActions: Object.keys(actionHandlers.current),
            };
        }
        
        try {
            console.log(`[AppState] Executing action: ${actionName}`, params);
            const result = await handler(params);
            return { success: true, ...result };
        } catch (error) {
            console.error(`[AppState] Action failed: ${actionName}`, error);
            return { success: false, error: error.message };
        }
    }, []);
    
    /**
     * Get all available actions for current context
     */
    const getAvailableActions = useCallback(() => {
        return Object.keys(actionHandlers.current);
    }, []);
    
    /**
     * Get current state (for AI context building)
     */
    const getState = useCallback(() => {
        return stateRef.current;
    }, []);
    
    /**
     * Reset to initial state
     */
    const resetState = useCallback(() => {
        setAppState(initialState);
        actionHandlers.current = {};
    }, []);
    
    const value = {
        // State
        appState,
        getState,
        
        // State setters
        publishState,
        setView,
        setProject,
        setShade,
        updateFormField,
        setActiveField,
        
        // Action system
        registerActions,
        unregisterActions,
        executeAction,
        getAvailableActions,
        
        // Utilities
        resetState,
    };
    
    return (
        <AppStateContext.Provider value={value}>
            {children}
        </AppStateContext.Provider>
    );
};

// Hook to use the context
export const useAppState = () => {
    const context = useContext(AppStateContext);
    if (!context) {
        throw new Error('useAppState must be used within an AppStateProvider');
    }
    return context;
};

// Optional hook that returns no-op functions when outside provider
// Use this for components that may be rendered outside the provider (e.g., portals, modals)
export const useAppStateOptional = () => {
    const context = useContext(AppStateContext);
    if (!context) {
        // Return no-op functions for components outside the provider
        return {
            appState: {},
            getState: () => ({}),
            publishState: () => {},
            setView: () => {},
            setProject: () => {},
            setShade: () => {},
            updateFormField: () => {},
            setActiveField: () => {},
            registerActions: () => {},
            unregisterActions: () => {},
            executeAction: async () => ({ success: false, error: 'Not in AppStateProvider' }),
            getAvailableActions: () => [],
            resetState: () => {},
        };
    }
    return context;
};

export default AppStateContext;
