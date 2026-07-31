import { useCallback, useEffect, useRef, useState } from 'react';

// Nom sous lequel ce navigateur apparait dans la liste des appareils Spotify.
// Sert aussi a le retrouver par l'API quand l'evenement 'ready' est manque.
const PLAYER_NAME = 'QuizBuzz Music';

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
  resumeOrPlay: (uri: string | null) => Promise<void>;
  setVolume: (vol: number) => void;
  /**
   * Leve le blocage d'autoplay du navigateur. Doit etre appelee de facon
   * synchrone depuis le gestionnaire de clic : apres le moindre await, le
   * navigateur ne considere plus l'action comme declenchee par l'utilisateur.
   */
  activate: () => void;
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
        name: PLAYER_NAME,
        getOAuthToken: (cb: (t: string) => void) => cb(accessToken),
        volume: 0.8,
      });

      player.addListener('ready', ({ device_id }: { device_id: string }) => {
        deviceIdRef.current = device_id;
        setState(s => ({ ...s, ready: true }));
      });

      player.addListener('not_ready', () => {
        // On garde volontairement l'identifiant : 'not_ready' se declenche
        // frequemment sans que le peripherique soit perdu, et le jeter ici
        // imposait un reenregistrement de plusieurs secondes a chaque lecture.
        // Un identifiant reellement mort est detecte par le 404 de play().
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
      deviceIdRef.current = null;
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

  const activate = useCallback(() => {
    // Volontairement non-async : l'appel doit partir dans la pile du clic.
    try {
      playerRef.current?.activateElement?.();
    } catch {
      // Sans importance si le navigateur n'en a pas besoin.
    }
  }, []);

  // Liste des peripheriques tels que Spotify les voit reellement. C'est la
  // seule source fiable : l'evenement 'ready' peut avoir ete manque, et le
  // peripherique peut avoir disparu sans que 'not_ready' soit parvenu.
  const listDevices = useCallback(async (): Promise<{ id: string; name: string }[]> => {
    if (!accessToken) return [];
    try {
      const r = await fetch('https://api.spotify.com/v1/me/player/devices', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!r.ok) return [];
      const d: { devices?: { id: string; name: string }[] } = await r.json();
      return (d.devices ?? []).map(x => ({ id: x.id, name: x.name }));
    } catch {
      return [];
    }
  }, [accessToken]);

  // Reconnecte le lecteur si besoin et attend qu'un peripherique soit annonce.
  const ensureDevice = useCallback(async (): Promise<string | null> => {
    if (deviceIdRef.current) return deviceIdRef.current;

    // Voie rapide : Spotify connait deja notre peripherique dans la plupart
    // des cas. Un aller-retour d'API coute bien moins qu'un reenregistrement.
    const fromApi = (await listDevices()).find(d => d.name === PLAYER_NAME);
    if (fromApi) {
      deviceIdRef.current = fromApi.id;
      return fromApi.id;
    }

    // Voie lente, reservee au cas ou le lecteur est reellement absent.
    if (playerRef.current) {
      try {
        await playerRef.current.connect();
      } catch {
        return null;
      }
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        if (deviceIdRef.current) return deviceIdRef.current;
        await new Promise(r => setTimeout(r, 200));
      }
    }
    return null;
  }, [listDevices]);

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
      // Filet de securite si play() est declenche directement par un clic.
      // La levee du blocage d'autoplay se fait normalement via activate(),
      // appelee en tete du gestionnaire, avant tout await.
      try {
        await playerRef.current?.activateElement?.();
      } catch {
        // Sans importance si le navigateur n'en a pas besoin.
      }

      const sendPlay = (device: string) =>
        fetch(`https://api.spotify.com/v1/me/player/play?device_id=${device}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ uris: [uriOrPreviewUrl] }),
        });

      // Message d'echec cite les peripheriques que Spotify voit : sans cela,
      // impossible de distinguer un SDK qui ne s'enregistre pas d'un
      // peripherique perdu entre-temps.
      const registrationFailure = async () => {
        const noms = (await listDevices()).map(d => d.name);
        return noms.length
          ? `Le lecteur « ${PLAYER_NAME} » ne s'est pas enregistre aupres de Spotify. Appareils vus par Spotify : ${noms.join(', ')}.`
          : `Le lecteur « ${PLAYER_NAME} » ne s'est pas enregistre et Spotify ne voit aucun appareil. Verifiez que l'onglet est au premier plan.`;
      };

      let device = await ensureDevice();
      if (!device) {
        const message = await registrationFailure();
        setState(s => ({ ...s, error: message }));
        return;
      }

      // Rend ce navigateur appareil actif : sans cela, un autre appareil
      // Spotify allume peut conserver la lecture et le navigateur reste muet.
      await fetch('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ device_ids: [device], play: false }),
      }).catch(() => null);

      let res = await sendPlay(device);

      // Spotify peut avoir retire le peripherique entre son annonce et l'ordre
      // de lecture : on en obtient un neuf et on retente une fois.
      if (res.status === 404) {
        deviceIdRef.current = null;
        device = await ensureDevice();
        if (!device) {
          // Sans peripherique de rechange, rapporter le 404 initial induirait
          // en erreur : le probleme est l'enregistrement, pas la lecture.
          const message = await registrationFailure();
          setState(s => ({ ...s, isPlaying: false, error: message }));
          return;
        }
        res = await sendPlay(device);
      }

      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        const message = detail?.error?.message ?? `HTTP ${res.status}`;
        setState(s => ({ ...s, isPlaying: false, error: `Spotify a refuse la lecture : ${message}` }));
        return;
      }

      setState(s => ({ ...s, isPlaying: true, position: 0, error: null }));
    }
  }, [mode, accessToken, ensureDevice, listDevices]);

  // Le SDK repond « no list was loaded » si on le pilote avant qu'une piste
  // n'ait ete chargee. getCurrentState() vaut null dans ce cas.
  const getSdkState = useCallback(async (): Promise<{ paused: boolean; position: number; duration: number } | null> => {
    const p = playerRef.current;
    if (!p) return null;
    try {
      return (await p.getCurrentState()) ?? null;
    } catch {
      return null;
    }
  }, []);

  const hasLoadedTrack = useCallback(async () => !!(await getSdkState()), [getSdkState]);

  const pause = useCallback(async () => {
    if (mode === 'preview') {
      audioRef.current?.pause();
      setState(s => ({ ...s, isPlaying: false }));
    } else if (await hasLoadedTrack()) {
      await playerRef.current?.pause();
    }
  }, [mode, hasLoadedTrack]);

  const resume = useCallback(async () => {
    if (mode === 'preview') {
      audioRef.current?.play();
      setState(s => ({ ...s, isPlaying: true }));
    } else if (await hasLoadedTrack()) {
      await playerRef.current?.resume();
    }
  }, [mode, hasLoadedTrack]);

  // Le bouton Play doit relancer reellement le morceau quand le SDK de ce
  // navigateur n'a rien de charge : un resume() n'aurait aucun effet.
  const resumeOrPlay = useCallback(async (uri: string | null) => {
    if (mode === 'preview') {
      audioRef.current?.play();
      setState(s => ({ ...s, isPlaying: true }));
      return;
    }
    const st = await getSdkState();
    // Une piste arrivee a son terme reste « chargee » mais en pause a la fin :
    // un resume() n'y produirait aucun son, il faut la relancer.
    const finished = !!st && st.paused && st.position >= Math.max(0, st.duration - 1500);
    if (st && !finished) {
      await playerRef.current?.resume();
      return;
    }
    if (uri) await play(uri);
  }, [mode, getSdkState, play]);

  const setVolume = useCallback((vol: number) => {
    if (mode === 'preview') {
      if (audioRef.current) audioRef.current.volume = vol;
    } else {
      playerRef.current?.setVolume(vol);
    }
  }, [mode]);

  return { ...state, play, pause, resume, resumeOrPlay, setVolume, activate };
}
