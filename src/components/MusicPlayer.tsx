import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSpotifyPlayer } from '../hooks/useSpotifyPlayer';
import type { MusicSessionConfig } from '../types';
import { Play, Pause, SkipForward, Volume2, VolumeX, Music, Loader2 } from 'lucide-react';

interface SpotifyTrack {
  uri: string;
  name: string;
  artists: { name: string }[];
  // Spotify ne renvoie plus preview_url : absent sur les reponses actuelles.
  preview_url?: string | null;
}

// Une entree de playlist expose la piste sous `item`; `track` est l'ancienne
// forme, conservee en repli.
interface PlaylistEntry {
  item?: SpotifyTrack | null;
  track?: SpotifyTrack | null;
}

interface Props {
  sessionId: string;
  accessToken: string;
  playbackMode: 'preview' | 'premium';
  config: MusicSessionConfig | null;
  /** Un morceau vient d'etre choisi, sans etre lance. */
  onTrackSelected: () => void;
  /** La lecture demarre : c'est le moment d'ouvrir la manche aux buzzers. */
  onTrackStarted: () => void;
  roundStatus: string | null;
}

export default function MusicPlayer({ sessionId, accessToken, playbackMode, config, onTrackSelected, onTrackStarted, roundStatus }: Props) {
  const player = useSpotifyPlayer(playbackMode, accessToken);
  const [tracks, setTracks] = useState<SpotifyTrack[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [tracksError, setTracksError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [trackLoading, setTrackLoading] = useState(false);
  const prevRoundStatusRef = useRef<string | null>(null);

  const roundStatusInitialisedRef = useRef(false);

  useEffect(() => {
    // Au montage il n'y a pas de transition a rattraper : piloter le lecteur
    // ici reviendrait a le faire avant tout chargement de piste.
    if (!roundStatusInitialisedRef.current) {
      roundStatusInitialisedRef.current = true;
      prevRoundStatusRef.current = roundStatus;
      return;
    }
    if (prevRoundStatusRef.current !== 'buzzed' && roundStatus === 'buzzed') {
      player.pause();
    }
    if (prevRoundStatusRef.current === 'buzzed' && roundStatus === 'open') {
      player.resume();
    }
    prevRoundStatusRef.current = roundStatus;
  }, [roundStatus]);

  const fetchPlaylistTracks = useCallback(async () => {
    if (!config?.spotify_playlist_id || !accessToken) return;
    setLoadingTracks(true);
    setTracksError(null);
    try {
      const allTracks: SpotifyTrack[] = [];
      let url: string | null = `https://api.spotify.com/v1/playlists/${config.spotify_playlist_id}/items?limit=100&fields=items(item(uri,name,artists)),next`;

      while (url) {
        const res: Response = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) {
          setTracksError(`Spotify a refuse la lecture de la playlist (HTTP ${res.status}).`);
          break;
        }
        const data: { items: PlaylistEntry[]; next: string | null } = await res.json();
        for (const entry of data.items ?? []) {
          const track = entry.item ?? entry.track;
          if (track?.uri) {
            allTracks.push(track);
          }
        }
        url = data.next;
      }
      setTracks(allTracks);
    } finally {
      setLoadingTracks(false);
    }
  }, [config?.spotify_playlist_id, accessToken]);

  useEffect(() => {
    fetchPlaylistTracks();
  }, [fetchPlaylistTracks]);

  // Choisit le morceau suivant sans le lancer : c'est l'admin qui declenche la
  // lecture par Play, y compris apres plusieurs passages d'affilee.
  const selectNextTrack = useCallback(async () => {
    if (tracks.length === 0) return;

    setTrackLoading(true);

    // Un morceau en cours ne doit pas continuer pendant qu'on change de
    // question.
    player.pause();

    const playedUris = config?.played_track_uris ?? [];
    let available = tracks.filter(t => !playedUris.includes(t.uri));

    // Toute la playlist a ete jouee : on repart du debut. La remise a zero est
    // persistee plus bas, avec le reste, pour ne pas retarder le son.
    const exhausted = available.length === 0;
    if (exhausted) available = tracks;

    if (playbackMode === 'preview') {
      available = available.filter(t => t.preview_url);
      if (available.length === 0) {
        // Spotify ne fournit plus d'extraits : sans compte Premium il n'y a
        // rien a jouer. On le dit au lieu d'echouer en silence.
        setTracksError(
          "Spotify ne fournit plus d'extraits de 30 secondes. Le mode musical necessite un compte Spotify Premium."
        );
        setTrackLoading(false);
        return;
      }
    }

    const randomIndex = Math.floor(Math.random() * available.length);
    const track = available[randomIndex];

    await supabase
      .from('music_session_config')
      .update({
        current_track_uri: track.uri,
        current_track_name: track.name,
        current_track_artist: track.artists.map(a => a.name).join(', '),
        current_track_preview_url: track.preview_url ?? null,
        played_track_uris: exhausted ? [track.uri] : [...playedUris, track.uri],
      })
      .eq('session_id', sessionId);

    setTrackLoading(false);
    onTrackSelected();
  }, [tracks, config, sessionId, playbackMode, player, onTrackSelected]);

  // Lance le morceau selectionne. C'est ici, et seulement ici, que la manche
  // demarre et que les joueurs peuvent buzzer.
  const startPlayback = useCallback(async () => {
    const uri = playbackMode === 'premium'
      ? config?.current_track_uri
      : config?.current_track_preview_url;
    if (!uri) {
      await selectNextTrack();
      return;
    }
    setTrackLoading(true);
    try {
      await player.resumeOrPlay(uri);
    } finally {
      setTrackLoading(false);
    }
    onTrackStarted();
  }, [config, playbackMode, player, selectNextTrack, onTrackStarted]);

  const toggleMute = () => {
    if (muted) {
      player.setVolume(volume);
      setMuted(false);
    } else {
      player.setVolume(0);
      setMuted(true);
    }
  };

  const handleVolumeChange = (v: number) => {
    setVolume(v);
    player.setVolume(v);
    if (v > 0) setMuted(false);
  };

  const progressPct = player.duration > 0 ? (player.position / player.duration) * 100 : 0;

  if (loadingTracks) {
    return (
      <div className="flex items-center gap-3 py-6 justify-center">
        <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
        <span className="text-sm text-slate-500">Chargement des morceaux...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {(tracksError || player.error) && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {tracksError ?? player.error}
        </div>
      )}

      {playbackMode === 'premium' && !player.ready && !player.error && (
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
          <span className="text-sm text-slate-500">Initialisation du lecteur Spotify...</span>
        </div>
      )}

      {/* Now playing */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-5 text-white">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-lg bg-[#1DB954]/20 flex items-center justify-center">
            <Music className="w-6 h-6 text-[#1DB954]" />
          </div>
          <div className="flex-1 min-w-0">
            {config?.current_track_name ? (
              <>
                <p className="font-bold text-white truncate">{config.current_track_name}</p>
                <p className="text-sm text-slate-300 truncate">{config.current_track_artist}</p>
              </>
            ) : (
              <>
                <p className="text-slate-400 text-sm">Aucun morceau</p>
                <p className="text-xs text-slate-500">{tracks.length} titres dans la playlist</p>
              </>
            )}
          </div>
          {config?.current_track_name && (
            <span className={`px-2.5 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${player.isPlaying ? 'bg-[#1DB954]/20 text-[#1DB954]' : 'bg-white/10 text-slate-300'}`}>
              {player.isPlaying ? 'En lecture' : 'En attente de Play'}
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-slate-700 rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-[#1DB954] transition-all duration-200"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          {player.isPlaying ? (
            <button
              onClick={() => player.pause()}
              className="w-12 h-12 rounded-full bg-white text-slate-900 flex items-center justify-center hover:scale-105 transition"
            >
              <Pause className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={() => {
                // activate() doit partir dans la pile du clic, avant tout await.
                player.activate();
                void startPlayback();
              }}
              disabled={trackLoading}
              className="w-12 h-12 rounded-full bg-white text-slate-900 flex items-center justify-center hover:scale-105 transition disabled:opacity-50"
              title="Lancer le morceau"
            >
              {trackLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>
          )}

          <button
            onClick={selectNextTrack}
            disabled={trackLoading || tracks.length === 0}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition disabled:opacity-50"
            title="Choisir le morceau suivant (sans le lancer)"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 ml-auto">
            <button onClick={toggleMute} className="text-slate-300 hover:text-white transition">
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={muted ? 0 : volume}
              onChange={e => handleVolumeChange(parseFloat(e.target.value))}
              className="w-20 h-1 accent-[#1DB954]"
            />
          </div>
        </div>
      </div>

      {/* Etat reel du lecteur Spotify, distinct de ce que dit la base */}
      {playbackMode === 'premium' && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600 space-y-1">
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full ${player.ready ? 'bg-green-500' : 'bg-slate-300'}`} />
            <span>Lecteur Spotify : {player.ready ? 'pret' : 'non initialise'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full ${player.isPlaying ? 'bg-green-500' : 'bg-slate-300'}`} />
            <span>
              {player.trackName
                ? `${player.isPlaying ? 'Lecture' : 'En pause'} : ${player.trackName} (${Math.floor(player.position / 1000)}s)`
                : 'Aucune piste chargee dans ce navigateur'}
            </span>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className="inline-block w-2 h-2 rounded-full bg-[#1DB954]" />
        {playbackMode === 'premium' ? 'Lecture complete (Premium)' : 'Extraits 30s'}
        <span className="ml-auto">{(config?.played_track_uris?.length ?? 0)}/{tracks.length} joues</span>
      </div>
    </div>
  );
}
