import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types';

const ACTIVE_SESSION_KEY = 'quizbuzz_active_session';

function slug(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function hashHex(input: string) {
  const buf = new TextEncoder().encode(input);
  const out = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(out)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function guestCreds(code: string, name: string) {
  const c = code.trim().toUpperCase();
  const n = slug(name);
  const email = `guest_${c}_${n}@quiz-guest.local`;
  const h = await hashHex(`quizbuzz:${c}:${n}`);
  const password = `Pg_${h.slice(0, 24)}`;
  return { email, password };
}

interface AuthContextValue {
  loading: boolean;
  userId: string | null;
  profile: Profile | null;
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  signInAdmin: (email: string, password: string) => Promise<void>;
  signUpAdmin: (email: string, password: string, displayName: string) => Promise<void>;
  joinAsPlayer: (displayName: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(() => {
    try { return localStorage.getItem(ACTIVE_SESSION_KEY); } catch { return null; }
  });

  const setActiveSessionId = (id: string | null) => {
    setActiveSessionIdState(id);
    try {
      if (id) localStorage.setItem(ACTIVE_SESSION_KEY, id);
      else localStorage.removeItem(ACTIVE_SESSION_KEY);
    } catch { /* noop */ }
  };

  const loadProfile = async (uid: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    setProfile(data as Profile | null);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user.id ?? null;
      setUserId(uid);
      if (uid) {
        loadProfile(uid).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user.id ?? null;
      setUserId(uid);
      (async () => {
        if (uid) await loadProfile(uid);
        else { setProfile(null); setActiveSessionId(null); }
      })();
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  const signInAdmin = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUpAdmin = async (email: string, password: string, displayName: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    const uid = data.user?.id;
    if (!uid) throw new Error('Inscription échouée');
    const { error: pErr } = await supabase.from('profiles').insert({
      id: uid, display_name: displayName, role: 'admin',
    });
    if (pErr) throw pErr;
    await loadProfile(uid);
  };

  const joinAsPlayer = async (displayName: string, code: string) => {
    const cleanCode = code.trim().toUpperCase();
    const cleanName = displayName.trim();
    if (!cleanName) throw new Error('Nom requis');
    if (!cleanCode) throw new Error('Code requis');

    const { email, password } = await guestCreds(cleanCode, cleanName);

    let uid: string | null = null;
    const signIn = await supabase.auth.signInWithPassword({ email, password });
    if (!signIn.error && signIn.data.user) {
      uid = signIn.data.user.id;
    } else {
      const signUp = await supabase.auth.signUp({ email, password });
      if (signUp.error) {
        throw new Error("Impossible de rejoindre: " + signUp.error.message);
      }
      uid = signUp.data.user?.id ?? null;
      if (!signUp.data.session) {
        const retry = await supabase.auth.signInWithPassword({ email, password });
        if (retry.error) throw new Error('Connexion échouée: ' + retry.error.message);
        uid = retry.data.user?.id ?? uid;
      }
    }
    if (!uid) throw new Error('Connexion échouée');

    const { error: pErr } = await supabase.from('profiles').upsert({
      id: uid, display_name: cleanName, role: 'player',
    });
    if (pErr) throw new Error('Profil: ' + pErr.message);

    const { data: sid, error: jErr } = await supabase.rpc('join_session_by_code', {
      p_code: cleanCode,
    });
    if (jErr) throw new Error('Session: ' + jErr.message);
    await loadProfile(uid);
    setActiveSessionId(sid as string);
  };

  const signOut = async () => {
    setActiveSessionId(null);
    await supabase.auth.signOut();
    setProfile(null);
    setUserId(null);
  };

  return (
    <AuthContext.Provider value={{
      loading, userId, profile, activeSessionId, setActiveSessionId,
      signInAdmin, signUpAdmin, joinAsPlayer, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth outside provider');
  return v;
}
