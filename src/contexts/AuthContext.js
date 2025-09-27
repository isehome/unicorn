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

const buildBypassValue = () => ({
  user: {
    id: 'bypass-user',
    email: 'developer@example.com',
    full_name: 'Bypass Mode User'
  },
  profile: null,
  session: null,
  loading: false,
  error: null,
  login: async () => {},
  logout: async () => {},
  refreshProfile: async () => {}
});

export function AuthProvider({ children }) {
  const bypassAuth = process.env.REACT_APP_BYPASS_AUTH === 'true';

  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(!bypassAuth);
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
    if (bypassAuth) return undefined;

    let mounted = true;

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
        if (mounted) setLoading(false);
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
      authListener?.subscription?.unsubscribe();
    };
  }, [bypassAuth, loadProfile]);

  const login = useCallback(async () => {
    if (bypassAuth) return null;
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
  }, [bypassAuth]);

  const logout = useCallback(async () => {
    if (bypassAuth) return;
    if (!supabase) return;
    try {
      await supabaseSignOut();
    } finally {
      setSession(null);
      setUser(null);
      setProfile(null);
      setLoading(false);
    }
  }, [bypassAuth]);

  const refreshProfile = useCallback(async () => {
    if (bypassAuth || !user) return null;
    return loadProfile(user.id);
  }, [bypassAuth, loadProfile, user]);

  const value = useMemo(() => {
    if (bypassAuth) {
      return buildBypassValue();
    }

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
  }, [bypassAuth, user, profile, session, loading, error, login, logout, refreshProfile]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
