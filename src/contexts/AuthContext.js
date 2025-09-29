import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  refreshProfile: async () => {}
});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadProfile = useCallback(async (userId) => {
    if (!supabase || !userId) {
      setProfile(null);
      return null;
    }

    try {
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) throw profileError;
      setProfile(data || null);
      return data || null;
    } catch (err) {
      console.error('Failed to load profile', err);
      setError(err);
      setProfile(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    let timeoutId = null;

    const initialise = async () => {
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

      // Set a timeout to prevent indefinite loading
      timeoutId = setTimeout(() => {
        if (mounted && loading) {
          console.warn('Auth initialization timeout - proceeding without auth');
          setSession(null);
          setUser(null);
          setProfile(null);
          setLoading(false);
          setError(new Error('Authentication timeout'));
        }
      }, 5000); // 5 second timeout

      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        if (!mounted) return;

        const nextSession = data?.session ?? null;
        const nextUser = nextSession?.user ?? null;

        setSession(nextSession);
        setUser(nextUser);
        setError(null);

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
          if (timeoutId) clearTimeout(timeoutId);
        }
      }
    };

    initialise();

    if (!supabase) {
      return () => {
        mounted = false;
      };
    }

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!mounted) return;

      setSession(newSession);
      const nextUser = newSession?.user ?? null;
      setUser(nextUser);

      if (nextUser) {
        await loadProfile(nextUser.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      authListener?.subscription?.unsubscribe();
    };
  }, [loadProfile, loading]);

  const login = useCallback(async () => {
    if (!supabase) {
      throw new Error('Supabase is not configured. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY.');
    }

    try {
      setLoading(true);
      setError(null);
      return await signInWithMicrosoft();
    } catch (err) {
      console.error('Microsoft sign-in failed', err);
      setError(err);
      setLoading(false);
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    if (!supabase) return;
    try {
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
    const enrichedUser = user ? { ...user, ...(profile || {}) } : null;
    return {
      user: enrichedUser,
      profile,
      session,
      loading,
      error,
      login,
      logout,
      refreshProfile
    };
  }, [user, profile, session, loading, error, login, logout, refreshProfile]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
