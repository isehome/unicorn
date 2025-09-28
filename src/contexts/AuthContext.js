import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  supabase,
  signInWithMicrosoft,
  signOut as supabaseSignOut
} from '../lib/supabase';

const AuthContext = createContext({
  user: null,
  profile: null,
  session: null,
  loading: true,
  error: null,
  login: async () => {},
  logout: async () => {},
  refreshProfile: async () => {},
  refreshSession: async () => {}
});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Prevent race conditions and duplicate initializations
  const initializationRef = useRef(false);
  const profileLoadingRef = useRef(false);
  const sessionRefreshTimeoutRef = useRef(null);

  const loadProfile = useCallback(async (userId) => {
    if (!supabase || !userId || profileLoadingRef.current) {
      return null;
    }

    profileLoadingRef.current = true;
    try {
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) {
        // Don't throw on 404, just return null
        if (profileError.code !== 'PGRST116') {
          console.error('Failed to load profile', profileError);
        }
        setProfile(null);
        return null;
      }
      
      setProfile(data || null);
      return data || null;
    } catch (err) {
      console.error('Failed to load profile', err);
      setError(err);
      setProfile(null);
      return null;
    } finally {
      profileLoadingRef.current = false;
    }
  }, []);

  // Auto-refresh session before expiry
  const scheduleSessionRefresh = useCallback((session) => {
    if (sessionRefreshTimeoutRef.current) {
      clearTimeout(sessionRefreshTimeoutRef.current);
    }

    if (!session?.expires_at) return;

    const expiresAt = new Date(session.expires_at * 1000);
    const now = new Date();
    const timeUntilExpiry = expiresAt.getTime() - now.getTime();
    
    // Refresh 5 minutes before expiry
    const refreshTime = Math.max(0, timeUntilExpiry - 5 * 60 * 1000);

    if (refreshTime > 0) {
      sessionRefreshTimeoutRef.current = setTimeout(async () => {
        try {
          const { data, error } = await supabase.auth.refreshSession();
          if (!error && data?.session) {
            setSession(data.session);
            setUser(data.session.user);
            scheduleSessionRefresh(data.session);
          }
        } catch (err) {
          console.error('Failed to refresh session', err);
        }
      }, refreshTime);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    if (!supabase) return null;
    
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) throw error;
      
      if (data?.session) {
        setSession(data.session);
        setUser(data.session.user);
        scheduleSessionRefresh(data.session);
        return data.session;
      }
      return null;
    } catch (err) {
      console.error('Failed to manually refresh session', err);
      setError(err);
      return null;
    }
  }, [scheduleSessionRefresh]);

  useEffect(() => {
    let mounted = true;

    const initialise = async () => {
      // Prevent duplicate initialization
      if (initializationRef.current) return;
      initializationRef.current = true;

      if (!supabase) {
        console.warn('Supabase client not configured; authentication disabled.');
        if (mounted) {
          setSession(null);
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
        return;
      }

      try {
        // Try to get existing session with retry
        let sessionData = null;
        let retries = 3;
        
        while (retries > 0 && !sessionData) {
          try {
            const { data, error: sessionError } = await supabase.auth.getSession();
            if (!sessionError && data?.session) {
              sessionData = data;
              break;
            }
          } catch (err) {
            console.warn(`Session fetch attempt ${4 - retries} failed`, err);
          }
          retries--;
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }

        if (!mounted) return;

        const nextSession = sessionData?.session ?? null;
        const nextUser = nextSession?.user ?? null;

        setSession(nextSession);
        setUser(nextUser);
        setError(null);

        if (nextSession) {
          scheduleSessionRefresh(nextSession);
        }

        if (nextUser) {
          await loadProfile(nextUser.id);
        } else {
          setProfile(null);
        }
      } catch (err) {
        console.error('Failed to initialise auth session', err);
        if (mounted) {
          setError(err);
          setSession(null);
          setUser(null);
          setProfile(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initialise();

    if (!supabase) {
      return () => {
        mounted = false;
        initializationRef.current = false;
      };
    }

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!mounted) return;

        // Ignore initial session to prevent duplicate processing
        if (event === 'INITIAL_SESSION') return;

        setSession(newSession);
        const nextUser = newSession?.user ?? null;
        setUser(nextUser);

        if (newSession) {
          scheduleSessionRefresh(newSession);
        }

        if (nextUser) {
          await loadProfile(nextUser.id);
        } else {
          setProfile(null);
        }
        
        setLoading(false);
      }
    );

    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe();
      if (sessionRefreshTimeoutRef.current) {
        clearTimeout(sessionRefreshTimeoutRef.current);
      }
      initializationRef.current = false;
    };
  }, [loadProfile, scheduleSessionRefresh]);

  const login = useCallback(async () => {
    if (!supabase) {
      throw new Error('Supabase is not configured. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY.');
    }

    try {
      setError(null);
      // Don't set loading to true here - let the Login component handle its own loading state
      // The OAuth flow will redirect the browser, so we won't be able to set loading back to false
      const result = await signInWithMicrosoft();
      // If we get here (no redirect), return the result
      return result;
    } catch (err) {
      console.error('Microsoft sign-in failed', err);
      setError(err);
      // Only set loading to false if there was an error (no redirect happened)
      setLoading(false);
      throw err;
    }
    // No finally block - it won't execute after a successful OAuth redirect
  }, []);

  const logout = useCallback(async () => {
    if (!supabase) return;
    
    try {
      if (sessionRefreshTimeoutRef.current) {
        clearTimeout(sessionRefreshTimeoutRef.current);
      }
      await supabaseSignOut();
    } finally {
      setSession(null);
      setUser(null);
      setProfile(null);
      setLoading(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return null;
    return loadProfile(user.id);
  }, [loadProfile, user]);

  const value = useMemo(() => {
    // Enrich user but preserve critical auth fields
    let enrichedUser = null;
    if (user) {
      enrichedUser = { ...user };
      if (profile) {
        // Merge profile data but don't overwrite critical auth fields
        const { id, email, ...profileData } = profile;
        enrichedUser = { ...enrichedUser, ...profileData };
        // Ensure we always have the auth email, not the profile email
        enrichedUser.email = user.email || enrichedUser.email;
        enrichedUser.id = user.id;
      }
    }
    
    return {
      user: enrichedUser,
      profile,
      session,
      loading,
      error,
      login,
      logout,
      refreshProfile,
      refreshSession
    };
  }, [user, profile, session, loading, error, login, logout, refreshProfile, refreshSession]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
