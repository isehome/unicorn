/**
 * Training Mode Context
 * Global state for AI training mode
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useLocation } from 'react-router-dom';
import { pageContextService } from '../services/pageContextService';
import { getPageInfo, getPatternRoute } from '../config/pageRegistry';
import { supabase } from '../lib/supabase';

// Simple UUID generator (avoids adding uuid dependency)
const generateSessionId = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const TrainingModeContext = createContext(null);

// Hardcoded owner email for first-time setup
const OWNER_EMAIL = 'stephe@isehome.com';

// Auto-save debounce delay (ms) - save after 2 seconds of no new entries
const AUTO_SAVE_DELAY = 2000;

export const TrainingModeProvider = ({ children }) => {
  const { user } = useAuth();
  const location = useLocation();

  // Training mode state
  const [isTrainingMode, setIsTrainingMode] = useState(false);
  const [currentTrainingSession, setCurrentTrainingSession] = useState(null);
  const [currentPageContext, setCurrentPageContext] = useState(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [userRole, setUserRole] = useState(null);

  // Training session transcript
  const [transcript, setTranscript] = useState([]);
  const [sessionType, setSessionType] = useState('initial'); // 'initial', 'append', 'retrain'

  // Session ID for auto-save (generated when session starts)
  const [sessionId, setSessionId] = useState(null);

  // Refs for auto-save debouncing
  const autoSaveTimeoutRef = useRef(null);
  const lastSavedTranscriptRef = useRef([]);

  // Fetch user role from profiles table
  useEffect(() => {
    const fetchUserRole = async () => {
      if (!user?.email) {
        setUserRole(null);
        return;
      }

      // Owner email always has access
      if (user.email === OWNER_EMAIL) {
        setUserRole('owner');
        return;
      }

      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('email', user.email)
          .single();

        if (error) {
          console.warn('[TrainingMode] Could not fetch user role:', error);
          setUserRole(null);
          return;
        }

        setUserRole(profile?.role || 'technician');
      } catch (err) {
        console.error('[TrainingMode] Error fetching user role:', err);
        setUserRole(null);
      }
    };

    fetchUserRole();
  }, [user?.email]);

  // Check if user can train (admin, director, or owner only)
  const canTrain = userRole === 'admin' || userRole === 'owner' || userRole === 'director';

  // Load page context when route changes (while in training mode)
  useEffect(() => {
    if (isTrainingMode) {
      loadCurrentPageContext();
    }
  }, [location.pathname, isTrainingMode]);

  const loadCurrentPageContext = useCallback(async () => {
    try {
      const patternRoute = getPatternRoute(location.pathname);
      const context = await pageContextService.getPageContext(patternRoute);
      setCurrentPageContext(context);
    } catch (error) {
      console.error('[TrainingMode] Error loading page context:', error);
      setCurrentPageContext(null);
    }
  }, [location.pathname]);

  /**
   * Enter training mode
   */
  const enterTrainingMode = useCallback(() => {
    console.log('[TrainingMode] enterTrainingMode called, canTrain:', canTrain, 'userRole:', userRole);
    if (!canTrain) {
      console.warn('[TrainingMode] User not authorized to train');
      return false;
    }
    console.log('[TrainingMode] Setting isTrainingMode to true');
    setIsTrainingMode(true);
    loadCurrentPageContext();
    return true;
  }, [canTrain, loadCurrentPageContext, userRole]);

  /**
   * Exit training mode
   */
  const exitTrainingMode = useCallback(() => {
    if (isSessionActive) {
      // Warn user they have unsaved session
      if (!window.confirm('You have an active training session. Exit without saving?')) {
        return false;
      }
    }
    setIsTrainingMode(false);
    setCurrentTrainingSession(null);
    setCurrentPageContext(null);
    setTranscript([]);
    setIsSessionActive(false);
    return true;
  }, [isSessionActive]);

  /**
   * Start a new training session for current page
   */
  const startTrainingSession = useCallback(async (type = 'initial') => {
    try {
      const patternRoute = getPatternRoute(location.pathname);
      const pageInfo = getPageInfo(location.pathname);

      // Generate a unique session ID for auto-save
      const newSessionId = generateSessionId();
      console.log('[TrainingMode] Starting session with ID:', newSessionId);
      setSessionId(newSessionId);

      // Initialize page context if doesn't exist
      let context = await pageContextService.getPageContext(patternRoute);
      if (!context) {
        const componentName = pageInfo?.componentName || patternRoute.split('/').pop() || 'UnknownPage';
        context = await pageContextService.initializePageContext(patternRoute, componentName, {
          pageTitle: pageInfo?.pageTitle,
          targetUsers: pageInfo?.targetUsers,
        });
      }

      setSessionType(type);
      setCurrentTrainingSession({
        id: newSessionId, // Include session ID
        pageRoute: patternRoute,
        componentName: context?.component_name || pageInfo?.componentName,
        pageTitle: context?.page_title || pageInfo?.pageTitle,
        startedAt: new Date().toISOString(),
        type,
      });
      setTranscript([]);
      lastSavedTranscriptRef.current = []; // Reset saved transcript tracker
      setIsSessionActive(true);
      setCurrentPageContext(context);

      return context;
    } catch (error) {
      console.error('[TrainingMode] Error starting training session:', error);
      return null;
    }
  }, [location.pathname]);

  /**
   * Add to transcript (during training conversation)
   */
  const addToTranscript = useCallback((role, content, metadata = {}) => {
    setTranscript(prev => [...prev, {
      role, // 'user' | 'ai'
      content,
      timestamp: new Date().toISOString(),
      ...metadata
    }]);
  }, []);

  /**
   * Auto-save transcript when it changes (debounced)
   */
  useEffect(() => {
    // Only auto-save if we have an active session and transcript has changed
    if (!isSessionActive || !sessionId || !currentTrainingSession) {
      return;
    }

    // Skip if transcript hasn't actually changed
    if (transcript.length === lastSavedTranscriptRef.current.length) {
      return;
    }

    // Clear any pending save
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Debounce the save
    autoSaveTimeoutRef.current = setTimeout(async () => {
      console.log('[TrainingMode] Auto-saving transcript, entries:', transcript.length);
      await pageContextService.autoSaveTranscript(
        sessionId,
        currentTrainingSession.pageRoute,
        transcript,
        sessionType,
        user?.id,
        user?.name || user?.email
      );
      lastSavedTranscriptRef.current = transcript;
    }, AUTO_SAVE_DELAY);

    // Cleanup on unmount
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [transcript, isSessionActive, sessionId, currentTrainingSession, sessionType, user]);

  /**
   * End training session and save
   */
  const endTrainingSession = useCallback(async (extractedData) => {
    if (!currentTrainingSession) {
      console.warn('[TrainingMode] No active session to end');
      return null;
    }

    // Clear any pending auto-save
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    try {
      // Mark the transcript as complete (if one was auto-saved)
      console.log('[TrainingMode] Marking transcript complete for route:', currentTrainingSession.pageRoute);
      const markedComplete = await pageContextService.markTranscriptComplete(
        currentTrainingSession.pageRoute,
        user?.id,
        extractedData
      );

      // If no transcript was found to mark complete, save as new
      if (!markedComplete) {
        console.log('[TrainingMode] No auto-saved transcript found, saving new one');
        await pageContextService.saveTrainingTranscript(
          currentTrainingSession.pageRoute,
          transcript,
          sessionType,
          user?.id,
          user?.name || user?.email
        );
      }

      // Save the extracted training data to page_ai_context
      const savedContext = await pageContextService.saveTrainingResults(
        currentTrainingSession.pageRoute,
        extractedData,
        user?.id,
        sessionType === 'append'
      );

      // Reset session state
      setCurrentTrainingSession(null);
      setTranscript([]);
      setSessionId(null);
      lastSavedTranscriptRef.current = [];
      setIsSessionActive(false);
      setCurrentPageContext(savedContext);

      return savedContext;
    } catch (error) {
      console.error('[TrainingMode] Error saving training session:', error);
      throw error;
    }
  }, [currentTrainingSession, transcript, sessionType, user, sessionId]);

  /**
   * Cancel training session without saving
   */
  const cancelTrainingSession = useCallback(() => {
    setCurrentTrainingSession(null);
    setTranscript([]);
    setIsSessionActive(false);
  }, []);

  /**
   * Get the current route's training status
   */
  const getCurrentRouteStatus = useCallback(() => {
    const patternRoute = getPatternRoute(location.pathname);
    return {
      route: patternRoute,
      actualPath: location.pathname,
      hasTrained: currentPageContext?.is_trained || false,
      isPublished: currentPageContext?.is_published || false,
      version: currentPageContext?.training_version || 0,
      lastTrainedAt: currentPageContext?.last_trained_at,
    };
  }, [location.pathname, currentPageContext]);

  /**
   * Get page info from registry
   */
  const getPageInfoForCurrentRoute = useCallback(() => {
    return getPageInfo(location.pathname);
  }, [location.pathname]);

  const value = {
    // State
    isTrainingMode,
    canTrain,
    currentTrainingSession,
    currentPageContext,
    isSessionActive,
    transcript,
    sessionType,

    // Actions
    enterTrainingMode,
    exitTrainingMode,
    startTrainingSession,
    addToTranscript,
    endTrainingSession,
    cancelTrainingSession,
    getCurrentRouteStatus,
    getPageInfoForCurrentRoute,

    // Helpers
    loadCurrentPageContext,
    setSessionType,
  };

  return (
    <TrainingModeContext.Provider value={value}>
      {children}
    </TrainingModeContext.Provider>
  );
};

export const useTrainingMode = () => {
  const context = useContext(TrainingModeContext);
  if (!context) {
    throw new Error('useTrainingMode must be used within TrainingModeProvider');
  }
  return context;
};

export default TrainingModeContext;
