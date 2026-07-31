import { useCallback, useEffect, useRef, useState } from 'react';

interface PlayerState {
  isPlaying: boolean;
  trackName: string | null;
  artistName: string | null;
  position: number;
  duration: number;
  ready: boolean;
  error: string | null;
}

interface SpotifyPlayerHook extends PlayerState {
  play: (uriOrPreviewUrl: string) => Promise<void>;
  pause: () => void;
  resume: () => void;
  setVolume: (vol: number) => void;
}

export function useSpotifyPlayer(
  mode: 'preview' | 'premium',
  accessToken: string | null
): SpotifyPlayerHook {
  const [state, setState] = useState<PlayerState>({
    isPlaying: false,
    trackName: null,
    artistName: null,
    position: 0,
    duration: 0,
    ready: mode === 'preview',
    error: null,
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playerRef = useRef<any>(null);
  const deviceIdRef = useRef<string | null>(null);
  const positionIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (mode === 'preview') {
      setState(s => ({ ...s, ready: true }));
      return;
    }

    if (!accessToken) return;

    const script = document.getElementById('spotify-sdk');
    if (!script) {
      const s = document.createElement('script');
      s.id = 'spotify-sdk';
      s.src = 'https://sdk.scdn.co/spotify-player.js';
      document.body.appendChild(s);
    }

    (window as any).onSpotifyWebPlaybackSDKReady = () => {
      const player = new (window as any).Spotify.Player({
        name: 'QuizBuzz Music',
        getOAuthToken: (cb: (t: string) => void) => cb(accessToken),
        volume: 0.8,
      });

      player.addListener('ready', ({ device_id }: { device_id: string }) => {
        deviceIdRef.current = device_id;
        setState(s => ({ ...s, ready: true }));
      });

      player.addListener('not_ready', () => {
        setState(s => ({ ...s, ready: false }));
      });

      player.addListener('player_state_changed', (s: any) => {
        if (!s) return;
        const track = s.track_window?.current_track;
        setState(prev => ({
          ...prev,
          isPlaying: !s.paused,
          trackName: track?.name || null,
          artistName: track?.artists?.map((a: any) => a.name).join(', ') || null,
          position: s.position,
          duration: s.duration,
        }));
      });

      player.addListener('initialization_error', ({ message }: { message: string }) => {
        setState(s => ({ ...s, error: message }));
      });
      player.addListener('authentication_error', ({ message }: { message: string }) => {
        setState(s => ({ ...s, error: `Authentification Spotify refusee : ${message}` }));
      });
      player.addListener('account_error', ({ message }: { message: string }) => {
        setState(s => ({ ...s, error: `Compte Spotify incompatible (Premium requis) : ${message}` }));
      });
      player.addListener('playback_error', ({ message }: { message: string }) => {
        setState(s => ({ ...s, error: `Erreur de lecture : ${message}` }));
      });

      player.connect();
      playerRef.current = player;
    };

    if ((window as any).Spotify) {
      (window as any).onSpotifyWebPlaybackSDKReady();
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.disconnect();
        playerRef.current = null;
      }
    };
  }, [mode, accessToken]);

  useEffect(() => {
    return () => {
      if (positionIntervalRef.current) clearInterval(positionIntervalRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const play = useCallback(async (uriOrPreviewUrl: string) => {
    if (mode === 'preview') {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(uriOrPreviewUrl);
      audioRef.current = audio;
      audio.volume = 0.8;

      audio.addEventListener('loadedmetadata', () => {
        setState(s => ({ ...s, duration: audio.duration * 1000 }));
      });
      audio.addEventListener('ended', () => {
        setState(s => ({ ...s, isPlaying: false, position: 0 }));
        if (positionIntervalRef.current) clearInterval(positionIntervalRef.current);
      });

      try {
        await audio.play();
      } catch (e) {
        setState(s => ({ ...s, isPlaying: false, error: `Lecture impossible : ${(e as Error).message}` }));
        return;
      }
      setState(s => ({ ...s, isPlaying: true, position: 0, error: null }));

      if (positionIntervalRef.current) clearInterval(positionIntervalRef.current);
      positionIntervalRef.current = window.setInterval(() => {
        if (audioRef.current) {
          setState(s => ({ ...s, position: audioRef.current!.currentTime * 1000 }));
        }
      }, 200);
    } else {
      if (!accessToken) {
        setState(s => ({ ...s, error: 'Jeton Spotify indisponible.' }));
        return;
      }
      if (!deviceIdRef.current) {
        setState(s => ({ ...s, error: "Le lecteur Spotify n'est pas encore pret. Patientez quelques secondes puis reessayez." }));
        return;
      }

      // Les navigateurs bloquent la lecture non declenchee par l'utilisateur.
      // activateElement doit etre appele dans la foulee du clic.
      try {
        await playerRef.current?.activateElement?.();
      } catch {
        // Sans importance si le navigateur n'en a pas besoin.
      }

      const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceIdRef.current}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uris: [uriOrPreviewUrl] }),
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        const message = detail?.error?.message ?? `HTTP ${res.status}`;
        setState(s => ({ ...s, isPlaying: false, error: `Spotify a refuse la lecture : ${message}` }));
        return;
      }

      setState(s => ({ ...s, isPlaying: true, position: 0, error: null }));
    }
  }, [mode, accessToken]);

  const pause = useCallback(() => {
    if (mode === 'preview') {
      audioRef.current?.pause();
      setState(s => ({ ...s, isPlaying: false }));
    } else {
      playerRef.current?.pause();
    }
  }, [mode]);

  const resume = useCallback(() => {
    if (mode === 'preview') {
      audioRef.current?.play();
      setState(s => ({ ...s, isPlaying: true }));
    } else {
      playerRef.current?.resume();
    }
  }, [mode]);

  const setVolume = useCallback((vol: number) => {
    if (mode === 'preview') {
      if (audioRef.current) audioRef.current.volume = vol;
    } else {
      playerRef.current?.setVolume(vol);
    }
  }, [mode]);

  return { ...state, play, pause, resume, setVolume };
}
