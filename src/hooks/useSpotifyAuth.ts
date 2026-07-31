import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const SPOTIFY_CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string;

const SPOTIFY_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
  'user-read-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ');

interface SpotifyState {
  connected: boolean;
  product: string | null;
  loading: boolean;
  error: string | null;
  accessToken: string | null;
}

export function useSpotifyAuth() {
  const [state, setState] = useState<SpotifyState>({
    connected: false,
    product: null,
    loading: true,
    error: null,
    accessToken: null,
  });
  const refreshTimeoutRef = useRef<number | null>(null);

  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    return {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      Apikey: SUPABASE_ANON_KEY,
    };
  };

  const fetchToken = useCallback(async () => {
    const headers = await getAuthHeaders();
    if (!headers) {
      setState(s => ({ ...s, loading: false, connected: false }));
      return;
    }

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/spotify-auth/token`, { headers });
      if (res.status === 404) {
        setState({ connected: false, product: null, loading: false, error: null, accessToken: null });
        return;
      }
      if (!res.ok) throw new Error('Failed to get token');
      const data = await res.json();
      setState({
        connected: true,
        product: data.product,
        loading: false,
        error: null,
        accessToken: data.access_token,
      });

      const expiresIn = new Date(data.expires_at).getTime() - Date.now() - 60_000;
      if (expiresIn > 0) {
        if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = window.setTimeout(() => fetchToken(), expiresIn);
      }
    } catch (e) {
      setState(s => ({ ...s, loading: false, error: (e as Error).message }));
    }
  }, []);

  useEffect(() => {
    fetchToken();
    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, [fetchToken]);

  const startAuth = useCallback(() => {
    const redirectUri = `${window.location.origin}/spotify-callback`;
    const params = new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: SPOTIFY_SCOPES,
      show_dialog: 'true',
    });
    window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
  }, []);

  const handleCallback = useCallback(async (code: string) => {
    setState(s => ({ ...s, loading: true, error: null }));
    const headers = await getAuthHeaders();
    if (!headers) {
      setState(s => ({ ...s, loading: false, error: 'Not authenticated' }));
      return false;
    }

    try {
      const redirectUri = `${window.location.origin}/spotify-callback`;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/spotify-auth/callback`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ code, redirect_uri: redirectUri }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Callback failed');
      }
      const data = await res.json();
      setState({
        connected: true,
        product: data.product,
        loading: false,
        error: null,
        accessToken: null,
      });
      await fetchToken();
      return true;
    } catch (e) {
      setState(s => ({ ...s, loading: false, error: (e as Error).message }));
      return false;
    }
  }, [fetchToken]);

  const disconnect = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('spotify_tokens').delete().eq('user_id', user.id);
    }
    setState({ connected: false, product: null, loading: false, error: null, accessToken: null });
  }, []);

  return {
    ...state,
    isPremium: state.product === 'premium',
    startAuth,
    handleCallback,
    disconnect,
    refreshToken: fetchToken,
  };
}
